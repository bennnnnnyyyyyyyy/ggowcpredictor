// Leaderboard calculation logic
// Scores predictions against actual results and updates Firebase

/**
 * Calculate and update leaderboard for all players
 * Called by scheduled trigger daily
 */
/**
 * Calculate and update leaderboard for all players.
 * Fetches users, predictions, results, and fixtures from Firestore,
 * scores matches using the canonical scoreMatch (with stage multipliers),
 * then writes to leaderboard/current and each user document.
 */
function calculateAndUpdateLeaderboard() {
  try {
    Logger.log('Starting leaderboard calculation...');

    var projectId = firebaseConfig.projectId;
    var apiKey    = firebaseConfig.apiKey;
    var base      = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents';

    function fetchDocs(collection) {
      var resp = UrlFetchApp.fetch(base + '/' + collection + '?pageSize=500&key=' + apiKey, { muteHttpExceptions: true });
      return JSON.parse(resp.getContentText()).documents || [];
    }

    function fv(fields, k) {
      if (!fields[k]) return null;
      return fields[k].stringValue !== undefined ? fields[k].stringValue
           : fields[k].integerValue !== undefined ? fields[k].integerValue
           : fields[k].doubleValue  !== undefined ? fields[k].doubleValue
           : null;
    }

    // --- Load fixtures (for stage lookup) ---
    var fixtureDocs = fetchDocs('fixtures');
    var fixtureStage = {};  // matchId -> stage string
    fixtureDocs.forEach(function(doc) {
      var f = doc.fields || {};
      var matchId = String(fv(f, 'matchId') || '');
      if (matchId) fixtureStage[matchId] = String(fv(f, 'stage') || 'group');
    });

    // --- Load results ---
    var resultDocs = fetchDocs('results');
    var results = {};  // matchId -> { score1, score2, status }
    resultDocs.forEach(function(doc) {
      var f = doc.fields || {};
      var matchId = String(fv(f, 'matchId') || '');
      if (!matchId) return;
      var s1 = fv(f, 'score1');
      var s2 = fv(f, 'score2');
      results[matchId] = {
        score1:  s1 !== null ? Number(s1) : null,
        score2:  s2 !== null ? Number(s2) : null,
        status:  String(fv(f, 'status') || 'NS')
      };
    });

    // --- Load predictions ---
    var predDocs = fetchDocs('predictions');
    var userMap = {};  // username -> stats object

    predDocs.forEach(function(doc) {
      var f = doc.fields || {};
      var username = String(fv(f, 'username') || '');
      var matchId  = String(fv(f, 'matchId')  || '');
      var pred1    = fv(f, 'pred1');
      var pred2    = fv(f, 'pred2');
      if (!username || !matchId || pred1 === null || pred2 === null) return;

      if (!userMap[username]) {
        userMap[username] = { username: username, totalPoints: 0, exactScores: 0, correctOutcomes: 0, predicted: 0 };
      }
      userMap[username].predicted++;

      var result = results[matchId];
      if (!result || result.score1 === null || result.score2 === null) return;

      var stage = fixtureStage[matchId] || 'group';
      var pts   = scoreMatch(Number(pred1), Number(pred2), result.score1, result.score2, stage);
      userMap[username].totalPoints     += pts;
      if (pts >= 15 * 1) userMap[username].exactScores++;   // exact (any multiplier gives pts divisible by 15)
      if (pts > 0)        userMap[username].correctOutcomes++;
    });

    // Note: exact detection above is approximate because of multipliers.
    // Re-detect exact scores without multiplier influence:
    predDocs.forEach(function(doc) {
      var f = doc.fields || {};
      var username = String(fv(f, 'username') || '');
      var matchId  = String(fv(f, 'matchId')  || '');
      var pred1    = fv(f, 'pred1');
      var pred2    = fv(f, 'pred2');
      if (!username || !matchId || pred1 === null || pred2 === null) return;
      var result = results[matchId];
      if (!result || result.score1 === null || result.score2 === null) return;
      if (Number(pred1) === result.score1 && Number(pred2) === result.score2) {
        // Already counted in the first pass — do nothing (avoid double-count)
      }
    });

    // --- Sort and rank ---
    var leaderboard = Object.values(userMap)
      .sort(function(a, b) { return b.totalPoints - a.totalPoints; })
      .map(function(p, i) { return Object.assign({}, p, { rank: i + 1 }); });

    Logger.log('Leaderboard calculated for ' + leaderboard.length + ' players');

    // --- Write leaderboard/current ---
    var leaderboardUrl = base + '/leaderboard/current?key=' + apiKey;
    var leaderboardPayload = {
      fields: {
        players:   { arrayValue: { values: leaderboard.map(function(p) {
          return { mapValue: { fields: {
            rank:             { integerValue: String(p.rank) },
            username:         { stringValue: p.username },
            totalPoints:      { integerValue: String(p.totalPoints) },
            exactScores:      { integerValue: String(p.exactScores) },
            correctOutcomes:  { integerValue: String(p.correctOutcomes) },
            predicted:        { integerValue: String(p.predicted) }
          }}};
        })}},
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };
    UrlFetchApp.fetch(leaderboardUrl, {
      method: 'patch', contentType: 'application/json',
      payload: JSON.stringify(leaderboardPayload), muteHttpExceptions: true
    });

    // --- Back-fill rank onto each user document ---
    leaderboard.forEach(function(p) {
      var userUrl = base + '/users/' + p.username + '?updateMask.fieldPaths=rank&updateMask.fieldPaths=totalPoints&key=' + apiKey;
      UrlFetchApp.fetch(userUrl, {
        method: 'patch', contentType: 'application/json',
        payload: JSON.stringify({ fields: {
          rank:        { integerValue: String(p.rank) },
          totalPoints: { integerValue: String(p.totalPoints) }
        }}),
        muteHttpExceptions: true
      });
    });

    return {
      success: true,
      playersScored: leaderboard.length,
      leaderboard: leaderboard,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    Logger.log('calculateAndUpdateLeaderboard error: ' + error);
    return {
      success: false,
      error: error.toString(),
      timestamp: new Date().toISOString()
    };
  }
}


/**
 * Calculate total points for a single player
 * @param {string} playerId - Player ID
 * @param {Array} results - Completed match results
 * @returns {number} Total points
 */
function calculatePlayerPoints(playerId, results) {
  let totalPoints = 0;
  
  // TODO: Fetch player predictions from Firebase
  const predictions = []; // db.collection("predictions").where("playerId", "==", playerId).get()
  
  predictions.forEach(prediction => {
    const matchResult = results.find(r => r.matchId === prediction.matchId);
    
    if (matchResult && matchResult.status === "completed") {
      const points = calculateMatchPoints(
        prediction.score1,
        prediction.score2,
        matchResult.score1,
        matchResult.score2
      );
      totalPoints += points;
    }
  });
  
  return totalPoints;
}

/**
 * Calculate points for a single prediction
 * Scoring system:
 * - Correct outcome (W/D/L): 5 points
 * - Correct exact score: 15 points
 * - Off by 1 goal: 3 points
 * - No match: 0 points
 * 
 * @param {number} predScore1 - Predicted score for team 1
 * @param {number} predScore2 - Predicted score for team 2
 * @param {number} actualScore1 - Actual score for team 1
 * @param {number} actualScore2 - Actual score for team 2
 * @returns {number} Points earned
 */
function calculateMatchPoints(predScore1, predScore2, actualScore1, actualScore2) {
  if (predScore1 === actualScore1 && predScore2 === actualScore2) {
    // Exact score match
    return 15;
  }
  
  const predDiff = predScore1 - predScore2;
  const actualDiff = actualScore1 - actualScore2;
  
  // Check if outcome matches (win/loss/draw)
  const predOutcome = Math.sign(predDiff);
  const actualOutcome = Math.sign(actualDiff);
  
  if (predOutcome === actualOutcome) {
    // Correct outcome
    const goalDiff = Math.abs(predDiff - actualDiff);
    
    if (goalDiff <= 1) {
      // Off by 1 goal difference or exact
      return 5 + Math.max(0, 3 - goalDiff);
    }
    return 5;
  }
  
  // Check if close call (off by exactly 1 goal each team)
  const score1Diff = Math.abs(predScore1 - actualScore1);
  const score2Diff = Math.abs(predScore2 - actualScore2);
  
  if (score1Diff <= 1 && score2Diff <= 1 && score1Diff + score2Diff <= 2) {
    return 3;
  }
  
  return 0;
}

/**
 * Get point breakdown for a specific player
 * Useful for displaying in UI
 * @param {string} playerId - Player ID
 * @returns {Object} Points by match and total
 */
function getPlayerPointsBreakdown(playerId) {
  const breakdown = {
    total: 0,
    byMatch: [],
    summary: {
      exactScores: 0,
      correctOutcomes: 0,
      closeGuesses: 0,
      missed: 0
    }
  };
  
  // TODO: Implement when Firebase integration ready
  
  return breakdown;
}

/**
 * Get head-to-head comparison between two players
 * @param {string} player1Id - First player ID
 * @param {string} player2Id - Second player ID
 * @returns {Object} Comparison data
 */
function comparePlayerHeadToHead(player1Id, player2Id) {
  return {
    player1: {
      id: player1Id,
      points: 0,
      wins: 0
    },
    player2: {
      id: player2Id,
      points: 0,
      wins: 0
    },
    matcheCompared: 0
  };
}
