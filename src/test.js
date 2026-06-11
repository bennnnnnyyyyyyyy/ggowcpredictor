// Apps Script test helpers
// Run these from the Apps Script editor or the Executions panel.

function testAppScriptBackend() {
  const results = {
    firebase: testFirebaseConnection(),
    teamsSync: syncTeamFlags(),
    fixtures: getFixtures(),
    leaderboard: calculateLeaderboard(),
  };

  Logger.log(JSON.stringify(results, null, 2));
  return results;
}

function testTeamFlagsOnly() {
  const result = syncTeamFlags();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testSingleTeamFlag(teamDocId) {
  const id = String(teamDocId || "mex").toLowerCase();
  const map = getTeamFlagsMap();
  const team = map[id];

  if (!team) {
    return {
      ok: false,
      message: `Unknown team id: ${id}`,
    };
  }

  const result = updateTeamsCollection({ [id]: team });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testApiFootball() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("API_FOOTBALL_KEY");
  Logger.log("API Key found: " + (apiKey ? "Yes" : "No"));
  if (!apiKey) return;
  const url = "https://v3.football.api-sports.io/fixtures?league=1&season=2026&timezone=UTC";
  Logger.log("Fetching: " + url);
  const resp = UrlFetchApp.fetch(url, { headers: { "x-apisports-key": apiKey }, muteHttpExceptions: true });
  Logger.log("Response Code: " + resp.getResponseCode());
  const text = resp.getContentText();
  Logger.log("Response text snippet: " + text.slice(0, 1000));
  const data = JSON.parse(text);
  Logger.log("Response results count: " + (data.response ? data.response.length : "undefined"));
  if (data.errors) {
    Logger.log("Errors: " + JSON.stringify(data.errors));
  }
}

function testRapidApiEndpoint(path) {
  const host = "free-api-live-football-data.p.rapidapi.com";
  const key = "a2c7484234mshb35750e2ab8a941p1057b9jsne114d43ae0e9";
  const url = `https://${host}/${path}`;
  Logger.log("Testing RapidAPI URL: " + url);
  try {
    const resp = UrlFetchApp.fetch(url, {
      headers: {
        "x-rapidapi-host": host,
        "x-rapidapi-key": key,
        "Content-Type": "application/json"
      },
      muteHttpExceptions: true
    });
    Logger.log("Response Code: " + resp.getResponseCode());
    const text = resp.getContentText();
    Logger.log("Response snippet: " + text.slice(0, 1500));
    return text;
  } catch (err) {
    Logger.log("Error testing RapidAPI: " + err.toString());
    return err.toString();
  }
}

function runRapidApiTests() {
  testRapidApiEndpoint("football-get-live-scores");
  testRapidApiEndpoint("football-get-all-fixtures");
}

function testZafronix(url) {
  const apiKey = "zwc_free_fcfb3caab7da86ec4e708942";
  Logger.log("Testing Zafronix URL: " + url);
  try {
    const resp = UrlFetchApp.fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json"
      },
      muteHttpExceptions: true
    });
    Logger.log("Response Code: " + resp.getResponseCode());
    const text = resp.getContentText();
    Logger.log("Response snippet: " + text.slice(0, 1500));
    return text;
  } catch (err) {
    Logger.log("Error testing Zafronix: " + err.toString());
    return err.toString();
  }
}

function runZafronixTests() {
  testZafronix("https://api.zafronix.com/fifa/worldcup/v1/tournaments/2026");
  testZafronix("https://api.zafronix.com/fifa/worldcup/v1/tournaments/2026/matches");
  testZafronix("https://api.zafronix.com/fifa/worldcup/v1/tournaments/2026/live");
}
