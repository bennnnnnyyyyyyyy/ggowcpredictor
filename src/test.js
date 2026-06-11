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
