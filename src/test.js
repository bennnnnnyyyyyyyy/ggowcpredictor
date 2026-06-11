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
