// GGO WC 2026 FIFA World Cup Predictor - Google Apps Script Backend
// Main deployment endpoint for the web app

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAVBLnjdM4cV9vBwV27dl6bEc4ZqVjuFBw", // Update with actual key
  projectId: "ggowcpredictor",
  databaseURL: "https://ggowcpredictor.firebaseio.com"
};

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
      case "migrateToSupabase":
        response = migrateFirestoreToSupabase();
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
  const fixtures = loadCollectionRows_("fixtures").map((fixture) => ({
    matchId: String(fixture.matchId || fixture.id || "").replace(/^match_/, ""),
    round: fixture.round || "",
    group: fixture.group || "",
    date: fixture.date || "",
    time: fixture.time || "",
    kickoffUTC: fixture.kickoffUTC || null,
    team1: fixture.team1 || "",
    team2: fixture.team2 || "",
    ground: fixture.ground || "",
    stage: fixture.stage || "",
  }));
  return { fixtures, timestamp: new Date().toISOString(), status: "ok" };
}
/**
 * Sync all data (fixtures, results, leaderboard)
 */
function syncAllData() {
  const fixtureRows = loadCollectionRows_("fixtures");
  const resultRows = loadCollectionRows_("results");
  const userRows = loadCollectionRows_("users", { optional: true });
  const predictionRows = loadCollectionRows_("predictions", { optional: true });

  const fixtures = fixtureRows.map((fixture) => ({
    matchId: String(fixture.matchId || fixture.id || "").replace(/^match_/, ""),
    round: fixture.round || "",
    group: fixture.group || "",
    date: fixture.date || "",
    time: fixture.time || "",
    kickoffUTC: fixture.kickoffUTC || null,
    team1: fixture.team1 || "",
    team2: fixture.team2 || "",
    ground: fixture.ground || "",
    stage: fixture.stage || "",
  }));

  const results = {};
  resultRows.forEach((result) => {
    const matchId = String(result.matchId || result.id || "").replace(/^match_/, "");
    if (!matchId) return;
    results[matchId] = {
      matchId,
      score1: nullableNumber_(result.score1),
      score2: nullableNumber_(result.score2),
      status: String(result.status || "NS").toUpperCase(),
    };
  });

  const users = userRows.map((user) => ({
    username: String(user.username || user.id || "").trim(),
    displayName: user.displayName || user.username || user.id || "",
    isAdmin: Boolean(user.isAdmin),
  })).filter((user) => user.username);

  const leaderboardSnapshot = buildLeaderboardSnapshot_({
    results: resultRows,
    predictions: predictionRows,
    users: userRows,
  });

  return {
    fixtures,
    results,
    users,
    leaderboard: leaderboardSnapshot.leaderboard,
    timestamp: new Date().toISOString(),
  };
}
/**
 * Calculate and return leaderboard
 */
function calculateLeaderboard() {
  const snapshot = getLeaderboardSnapshot();
  return {
    leaderboard: snapshot.leaderboard,
    scoredMatches: snapshot.scoredMatches,
    timestamp: snapshot.timestamp,
  };
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
