// GGO WC 2026 FIFA World Cup Predictor - Google Apps Script Backend
// Main deployment endpoint for the web app
// firebaseConfig is declared in firebaseConfig.js (var, globally hoisted)


/**
 * Main deployment endpoint
 * Frontend will call this via fetch to GET fixture data
 */
function doGet(e) {
  const action = e.parameter.action || "fixtures";
  
  try {
    let response = {};
    
    switch (action) {
      case "fixtures":
        response = getFixtures();
        break;
      case "sync":
        response = syncAllData();
        break;
      case "leaderboard":
        response = calculateLeaderboard();
        break;
      default:
        response = { error: "Unknown action" };
    }
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * POST endpoint for triggered updates
 */
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  
  try {
    let response = {};
    
    switch (action) {
      case "seedFixtures":
        response = seedFixturesFromJSON();
        break;
      case "updateScores":
        response = fetchAndUpdateLiveScores();
        break;
      case "calculateScores":
        response = calculateAndUpdateLeaderboard();
        break;
      default:
        response = { error: "Unknown action" };
    }
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get all fixtures from Firebase
 */
function getFixtures() {
  const projectId = firebaseConfig.projectId;
  const apiKey = firebaseConfig.apiKey;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fixtures?pageSize=200&key=${apiKey}`;
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(resp.getContentText());
  const fixtures = (data.documents || []).map(d => {
    const f = d.fields;
    const get = (k) => f[k] ? (f[k].stringValue ?? f[k].integerValue ?? null) : null;
    return {
      matchId: get("matchId"),
      round: get("round"),
      group: get("group"),
      date: get("date"),
      time: get("time"),
      kickoffUTC: get("kickoffUTC"),
      team1: get("team1"),
      team2: get("team2"),
      ground: get("ground"),
      stage: get("stage"),
    };
  });
  return { fixtures, timestamp: new Date().toISOString(), status: "ok" };
}
/**
 * Sync all data (fixtures, results, leaderboard)
 */
function syncAllData() {
  const projectId = firebaseConfig.projectId;
  const apiKey = firebaseConfig.apiKey;
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  function fetchCollection(name) {
    const resp = UrlFetchApp.fetch(`${base}/${name}?pageSize=500&key=${apiKey}`, { muteHttpExceptions: true });
    return JSON.parse(resp.getContentText()).documents || [];
  }

  function field(f, k) {
    if (!f[k]) return null;
    return f[k].stringValue ?? f[k].integerValue ?? f[k].doubleValue ?? f[k].nullValue ?? null;
  }

  const fixtureDocs = fetchCollection("fixtures");
  const resultDocs  = fetchCollection("results");

  const fixtures = fixtureDocs.map(d => {
    const f = d.fields;
    return {
      matchId: field(f,"matchId"), round: field(f,"round"), group: field(f,"group"),
      date: field(f,"date"), time: field(f,"time"), kickoffUTC: field(f,"kickoffUTC"),
      team1: field(f,"team1"), team2: field(f,"team2"), ground: field(f,"ground"), stage: field(f,"stage"),
    };
  });

  const results = {};
  resultDocs.forEach(d => {
    const f = d.fields;
    const matchId = field(f,"matchId");
    if (matchId) results[matchId] = {
      matchId,
      score1: field(f,"score1"),
      score2: field(f,"score2"),
      status: field(f,"status") || "NS",
    };
  });

  const leaderboard = buildLeaderboard(projectId, apiKey, base, results);

  return { fixtures, results, leaderboard, timestamp: new Date().toISOString() };
}
/**
 * Calculate and return leaderboard
 */
function calculateLeaderboard() {
  const sync = syncAllData();
  return { leaderboard: sync.leaderboard, timestamp: sync.timestamp };
}

/**
 * Scheduled trigger: Runs every 60 seconds to fetch live scores
 */
function scheduledLiveScoresUpdate() {
  try {
    Logger.log("Starting live scores update...");
    const result = fetchAndUpdateLiveScores();
    Logger.log("Live scores update completed: " + JSON.stringify(result));
  } catch (error) {
    Logger.log("Error in scheduledLiveScoresUpdate: " + error.toString());
  }
}

/**
 * Scheduled trigger: Runs daily to recalculate leaderboard
 */
function scheduledLeaderboardUpdate() {
  try {
    Logger.log("Starting leaderboard calculation...");
    const result = calculateAndUpdateLeaderboard();
    Logger.log("Leaderboard update completed: " + JSON.stringify(result));
  } catch (error) {
    Logger.log("Error in scheduledLeaderboardUpdate: " + error.toString());
  }
}
function buildLeaderboard(projectId, apiKey, base, results) {
  try {
    const predDocs = UrlFetchApp.fetch(`${base}/predictions?pageSize=500&key=${apiKey}`, { muteHttpExceptions: true });
    const predictions = JSON.parse(predDocs.getContentText()).documents || [];
    const userMap = {};

    predictions.forEach(d => {
      const f = d.fields;
      const get = k => f[k] ? (f[k].stringValue ?? f[k].integerValue ?? null) : null;
      const username = get("username");
      const matchId  = get("matchId");
      const pred1    = Number(get("pred1"));
      const pred2    = Number(get("pred2"));
      if (!username || !matchId) return;

      if (!userMap[username]) userMap[username] = { username, totalPoints:0, exactScores:0, correctOutcomes:0, predicted:0 };
      userMap[username].predicted++;

      const result = results[matchId];
      if (!result || result.score1 === null || result.score2 === null) return;

      const pts = scoreMatch(pred1, pred2, Number(result.score1), Number(result.score2));
      userMap[username].totalPoints += pts;
      if (pts === 15) userMap[username].exactScores++;
      if (pts > 0)    userMap[username].correctOutcomes++;
    });

    return Object.values(userMap)
      .sort((a,b) => b.totalPoints - a.totalPoints)
      .map((p,i) => ({ ...p, rank: i+1 }));
  } catch(e) {
    return [];
  }
}

/**
 * Canonical scoring function with stage multipliers.
 * Base points: exact=15, correct result + diff≤1=8, correct result=5, wrong result (close)=3, miss=0.
 * Stage multipliers: group/r32=×1, r16=×2, qf=×3, sf=×4, third/final=×5.
 * @param {number} p1 - Predicted home score
 * @param {number} p2 - Predicted away score
 * @param {number} a1 - Actual home score
 * @param {number} a2 - Actual away score
 * @param {string} [stage] - Match stage key
 * @returns {number} Points awarded (floor of base * multiplier)
 */
function scoreMatch(p1, p2, a1, a2, stage) {
  var MULTIPLIERS = { group: 1, r32: 1, r16: 2, qf: 3, sf: 4, third: 5, final: 5 };
  var multiplier = MULTIPLIERS[String(stage || 'group').toLowerCase()] || 1;

  var base;
  if (p1 === a1 && p2 === a2) {
    base = 15;
  } else {
    var po = Math.sign(p1 - p2), ao = Math.sign(a1 - a2);
    if (po === ao) {
      base = Math.abs((p1 - p2) - (a1 - a2)) <= 1 ? 8 : 5;
    } else {
      var totalGap = Math.abs(p1 - a1) + Math.abs(p2 - a2);
      base = totalGap <= 2 ? 3 : 0;
    }
  }

  return Math.floor(base * multiplier);
}
