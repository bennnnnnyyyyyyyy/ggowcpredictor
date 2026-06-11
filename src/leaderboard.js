// Leaderboard calculation logic
// Scores predictions against actual results and updates Firebase

/**
 * Calculate and update leaderboard for all players
 * Called by scheduled trigger daily
 */
function calculateAndUpdateLeaderboard() {
  try {
    Logger.log("Starting leaderboard calculation...");
    
    const leaderboard = [];
    let players = []; // TODO: Fetch from Firebase
    let results = []; // TODO: Fetch completed match results from Firebase
    
    // For each player, calculate total points
    players.forEach(player => {
      const points = calculatePlayerPoints(player.id, results);
      leaderboard.push({
        playerId: player.id,
        playerName: player.name,
        totalPoints: points,
        rank: 0 // Will be set after sorting
      });
    });
    
    // Sort by points descending
    leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
    
    // Assign ranks
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    Logger.log(`Leaderboard calculated for ${leaderboard.length} players`);
    
    // TODO: Update Firebase leaderboard collection
    
    return {
      success: true,
      playersScored: leaderboard.length,
      leaderboard: leaderboard,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
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
