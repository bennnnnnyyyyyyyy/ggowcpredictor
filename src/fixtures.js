// Fixtures seeding logic
// Reads from openfootball/worldcup.json and populates Firebase

/**
 * Seed all 104 WC 2026 fixtures from JSON source
 * Reads from the 2026 folder cloned from openfootball repo
 */
function seedFixturesFromJSON() {
  try {
    Logger.log("Starting fixture seed process...");

    // Read the worldcup.json file from local storage
    const file = DriveApp.getFilesByName("worldcup.json").next();
    const content = file.getBlob().getDataAsString();
    const data = JSON.parse(content);

    let fixturesToCreate = [];
    let matchId = 1;

    // Process each match from the JSON structure
    if (data.matches) {
      data.matches.forEach((match) => {
        const fixture = {
          matchId: matchId,
          date: match.date,
          time: match.time,
          round: match.round,
          team1: match.team1,
          team2: match.team2,
          group: match.group || null,
          venue: match.ground || null,
          result: null,
          score1: null,
          score2: null,
          status: "scheduled", // scheduled, live, completed
        };
        fixturesToCreate.push(fixture);
        matchId++;
      });
    }

    Logger.log(`Prepared ${fixturesToCreate.length} fixtures for seeding`);

    // Write all fixtures to Firebase Firestore using REST API
    const projectId = "ggowcpredictor";
    const apiKey = firebaseConfig.apiKey;
    let successCount = 0;
    let errorCount = 0;

    fixturesToCreate.forEach((fixture) => {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fixtures?key=${apiKey}`;

        const payload = {
          fields: {
            matchId: { integerValue: fixture.matchId },
            date: { stringValue: fixture.date },
            time: { stringValue: fixture.time },
            round: { stringValue: fixture.round },
            team1: { stringValue: fixture.team1 },
            team2: { stringValue: fixture.team2 },
            group: { stringValue: fixture.group || "" },
            venue: { stringValue: fixture.venue || "" },
            score1: { nullValue: null },
            score2: { nullValue: null },
            status: { stringValue: fixture.status },
            createdAt: { timestampValue: new Date().toISOString() },
          },
        };

        const options = {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        };

        const response = UrlFetchApp.fetch(url, options);
        if (response.getResponseCode() === 201) {
          successCount++;
        } else {
          Logger.log(
            `Error creating fixture ${fixture.matchId}: ${response.getContentText()}`,
          );
          errorCount++;
        }
      } catch (e) {
        Logger.log(`Exception for fixture ${fixture.matchId}: ${e}`);
        errorCount++;
      }
    });

    Logger.log(
      `Seeding complete: ${successCount} created, ${errorCount} failed`,
    );

    return {
      success: true,
      fixturesSeeded: successCount,
      errors: errorCount,
      total: fixturesToCreate.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    Logger.log(`Seed error: ${error}`);
    return {
      success: false,
      error: error.toString(),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Fetch live scores from Zafronix and update Firebase
 * Called by scheduled trigger every 60 seconds
 */
function fetchAndUpdateLiveScores() {
  const projectId = "ggowcpredictor";
  const fbKey = firebaseConfig.apiKey;
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  // Helper function to normalize team names for matching
  function cleanTeamName(name) {
    let clean = String(name || "")
      .toLowerCase()
      .replace(/\band\b/g, "")
      .replace(/&/g, "")
      .replace(/[^a-z0-9]/g, "");

    // Resolve aliases
    if (
      clean === "korearepublic" ||
      clean === "repofkorea" ||
      clean === "koreasouth"
    )
      return "southkorea";
    if (clean === "unitedstates" || clean === "unitedstatesofamerica")
      return "usa";
    if (clean === "czechia") return "czechrepublic";
    if (clean === "cotedivoire" || clean === "ivorycoast") return "ivorycoast";
    if (clean === "curaao" || clean === "curacao") return "curacao";
    if (
      clean === "drcongo" ||
      clean === "congodr" ||
      clean === "democraticrepublicofcongo" ||
      clean === "congodemocraticrepublic"
    )
      return "drcongo";
    if (clean === "capeverde" || clean === "caboverde") return "capeverde";

    return clean;
  }

  // Fetch all fixtures from Firestore to map team names to matchIds
  let dbFixtures = [];
  try {
    const fixturesResp = UrlFetchApp.fetch(
      `${base}/fixtures?pageSize=200&key=${fbKey}`,
      { method: "get", muteHttpExceptions: true },
    );
    const fixturesData = JSON.parse(fixturesResp.getContentText());
    if (fixturesData && fixturesData.documents) {
      dbFixtures = fixturesData.documents
        .map((doc) => {
          const fields = doc.fields || {};
          const get = (k) =>
            fields[k]
              ? (fields[k].stringValue ?? fields[k].integerValue ?? null)
              : null;
          return {
            matchId: get("matchId"),
            team1: get("team1"),
            team2: get("team2"),
          };
        })
        .filter((f) => f.matchId);
    }
  } catch (err) {
    Logger.log("Error loading DB fixtures for matching: " + err.toString());
  }

  // Fetch WC 2026 matches from Zafronix
  const zafronixKey = "zwc_free_fcfb3caab7da86ec4e708942";
  const resp = UrlFetchApp.fetch(
    "https://api.zafronix.com/fifa/worldcup/v1/tournaments/2026/matches",
    {
      headers: { "X-API-Key": zafronixKey, Accept: "application/json" },
      muteHttpExceptions: true,
    },
  );

  if (resp.getResponseCode() !== 200) {
    const errText = resp.getContentText();
    Logger.log("Zafronix error: " + errText);
    return {
      success: false,
      error: "Zafronix HTTP " + resp.getResponseCode(),
      scoresUpdated: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const data = JSON.parse(resp.getContentText());
  // Zafronix returns { matches: [...] } or an array directly
  const apiMatches = Array.isArray(data) ? data : data.matches || [];

  // Map Zafronix status strings to our short codes
  function mapStatus(zStatus) {
    if (!zStatus) return "NS";
    const s = String(zStatus).toLowerCase();
    if (
      s === "completed" ||
      s === "finished" ||
      s === "ft" ||
      s === "full-time"
    )
      return "FT";
    if (s === "halftime" || s === "ht" || s === "half-time") return "HT";
    if (
      s === "live" ||
      s === "in_play" ||
      s === "inplay" ||
      s === "1h" ||
      s === "first half"
    )
      return "1H";
    if (s === "second half" || s === "2h") return "2H";
    if (s === "aet" || s === "extra time") return "AET";
    if (s === "pen" || s === "penalties") return "PEN";
    return "NS";
  }

  function readScore(item, side) {
    const directKeys =
      side === "home"
        ? [
            "homeScore",
            "score1",
            "team1Score",
            "home_goal",
            "homeGoals",
            "goalsHome",
          ]
        : [
            "awayScore",
            "score2",
            "team2Score",
            "away_goal",
            "awayGoals",
            "goalsAway",
          ];

    for (const key of directKeys) {
      if (item[key] !== undefined && item[key] !== null && item[key] !== "")
        return item[key];
    }

    const nested = item.score || item.result || item.scores;
    if (nested && typeof nested === "object") {
      const paths =
        side === "home"
          ? [
              ["home"],
              ["local"],
              ["team1"],
              ["fulltime", "home"],
              ["ft", "home"],
              ["final", "home"],
            ]
          : [
              ["away"],
              ["visitor"],
              ["team2"],
              ["fulltime", "away"],
              ["ft", "away"],
              ["final", "away"],
            ];

      for (const path of paths) {
        let value = nested;
        let found = true;
        for (const key of path) {
          if (value && typeof value === "object" && key in value) {
            value = value[key];
          } else {
            found = false;
            break;
          }
        }
        if (found && value !== undefined && value !== null && value !== "")
          return value;
      }
    }

    return null;
  }

  let updated = 0;
  apiMatches.forEach((item) => {
    // Zafronix field names (confirmed from test output)
    const homeTeam = cleanTeamName(item.homeTeam || item.team1 || "");
    const awayTeam = cleanTeamName(item.awayTeam || item.team2 || "");
    const score1 = readScore(item, "home");
    const score2 = readScore(item, "away");
    const status = mapStatus(item.status);

    if (!homeTeam || !awayTeam) return;

    // Find the matching fixture in our DB
    const matched = dbFixtures.find((f) => {
      const dbHome = cleanTeamName(f.team1);
      const dbAway = cleanTeamName(f.team2);
      return (
        (dbHome === homeTeam && dbAway === awayTeam) ||
        (dbHome === awayTeam && dbAway === homeTeam)
      );
    });

    if (!matched) return; // Skip if we can't match to our fixture

    const targetMatchId = String(matched.matchId);
    const docId = `match_${targetMatchId}`;
    const url = `${base}/results/${docId}?key=${fbKey}`;
    const payload = {
      fields: {
        matchId: { stringValue: targetMatchId },
        score1:
          score1 !== null
            ? { integerValue: String(score1) }
            : { nullValue: null },
        score2:
          score2 !== null
            ? { integerValue: String(score2) }
            : { nullValue: null },
        status: { stringValue: status },
        lastUpdated: { stringValue: new Date().toISOString() },
      },
    };
    UrlFetchApp.fetch(url, {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    updated++;
  });

  return {
    success: true,
    scoresUpdated: updated,
    timestamp: new Date().toISOString(),
  };
}
/**
 * Parse worldcup.json structure and extract match details
 * Expected format from openfootball/worldcup.json
 */
function parseWorldcupJSON(jsonData) {
  const parsed = {
    groupStage: [],
    knockout: [],
  };

  // Group stage matches
  if (jsonData.rounds) {
    jsonData.rounds.forEach((round) => {
      if (round.name.includes("Group")) {
        parsed.groupStage.push(...(round.matches || []));
      } else {
        parsed.knockout.push(...(round.matches || []));
      }
    });
  }

  return parsed;
}

/**
 * Validate fixture data before storage
 */
function validateFixture(fixture) {
  const required = ["date", "team1", "team2", "stage"];

  for (const field of required) {
    if (!fixture[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return true;
}

/**
 * Seed initial live results into Firestore from the open World Cup API.
 * Run this once to populate `results/` before the Cloudflare Worker starts.
 */
function seedInitialResultsFromWorldcup26() {
  try {
    Logger.log("Starting initial results seed from worldcup26.ir...");

    const projectId = "ggowcpredictor";
    const apiKey = firebaseConfig.apiKey;
    const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

    function fetchCollection(name) {
      const resp = UrlFetchApp.fetch(
        `${base}/${name}?pageSize=500&key=${apiKey}`,
        {
          method: "get",
          muteHttpExceptions: true,
        },
      );
      return JSON.parse(resp.getContentText()).documents || [];
    }

    function field(fields, key) {
      if (!fields[key]) return null;
      return (
        fields[key].stringValue ??
        fields[key].integerValue ??
        fields[key].doubleValue ??
        null
      );
    }

    function cleanTeamName(name) {
      let clean = String(name || "")
        .toLowerCase()
        .replace(/\band\b/g, "")
        .replace(/&/g, "")
        .replace(/[^a-z0-9]/g, "");

      if (
        clean === "korearepublic" ||
        clean === "repofkorea" ||
        clean === "koreasouth"
      )
        return "southkorea";
      if (clean === "unitedstates" || clean === "unitedstatesofamerica")
        return "usa";
      if (clean === "czechia") return "czechrepublic";
      if (clean === "cotedivoire" || clean === "ivorycoast")
        return "ivorycoast";
      if (clean === "curaao" || clean === "curacao") return "curacao";
      if (
        clean === "drcongo" ||
        clean === "congodr" ||
        clean === "democraticrepublicofcongo" ||
        clean === "congodemocraticrepublic"
      )
        return "drcongo";
      if (clean === "capeverde" || clean === "caboverde") return "capeverde";
      return clean;
    }

    function mapStatus(game) {
      if (String(game.finished).toLowerCase() === "true") return "FT";
      const elapsed = String(game.time_elapsed || "").toLowerCase();
      if (elapsed && elapsed !== "notstarted") return "LIVE";
      return "NS";
    }

    const fixtureDocs = fetchCollection("fixtures");
    const resultDocs = fetchCollection("results");

    const fixtures = fixtureDocs.map((doc) => {
      const fields = doc.fields || {};
      return {
        matchId: String(
          field(fields, "matchId") ||
            doc.name
              .split("/")
              .pop()
              .replace(/^match_/, ""),
        ),
        team1: field(fields, "team1") || "",
        team2: field(fields, "team2") || "",
      };
    });

    const existing = {};
    resultDocs.forEach((doc) => {
      const fields = doc.fields || {};
      const matchId = String(
        field(fields, "matchId") ||
          doc.name
            .split("/")
            .pop()
            .replace(/^match_/, ""),
      );
      existing[matchId] = true;
    });

    const worldcupResp = UrlFetchApp.fetch("https://worldcup26.ir/get/games", {
      method: "get",
      muteHttpExceptions: true,
      headers: { Accept: "application/json" },
    });

    if (worldcupResp.getResponseCode() !== 200) {
      return {
        success: false,
        error: `worldcup26.ir HTTP ${worldcupResp.getResponseCode()}`,
        timestamp: new Date().toISOString(),
      };
    }

    const data = JSON.parse(worldcupResp.getContentText());
    const games = Array.isArray(data) ? data : data.games || [];

    let created = 0;
    let matched = 0;

    games.forEach((game) => {
      const homeTeam = cleanTeamName(
        game.home_team_name_en || game.home_team_label || game.home_team || "",
      );
      const awayTeam = cleanTeamName(
        game.away_team_name_en || game.away_team_label || game.away_team || "",
      );
      if (!homeTeam || !awayTeam) return;

      const fixture = fixtures.find((f) => {
        const dbHome = cleanTeamName(f.team1);
        const dbAway = cleanTeamName(f.team2);
        return (
          (dbHome === homeTeam && dbAway === awayTeam) ||
          (dbHome === awayTeam && dbAway === homeTeam)
        );
      });

      if (!fixture) return;

      matched++;
      if (existing[fixture.matchId]) return;

      const docId = `match_${fixture.matchId}`;
      const url = `${base}/results/${docId}?key=${apiKey}`;
      const payload = {
        fields: {
          matchId: { stringValue: fixture.matchId },
          score1:
            game.home_score !== undefined && game.home_score !== null
              ? { integerValue: String(game.home_score) }
              : { nullValue: null },
          score2:
            game.away_score !== undefined && game.away_score !== null
              ? { integerValue: String(game.away_score) }
              : { nullValue: null },
          status: { stringValue: mapStatus(game) },
          timeElapsed: { stringValue: String(game.time_elapsed || "") },
          lastUpdated: { stringValue: new Date().toISOString() },
        },
      };

      const resp = UrlFetchApp.fetch(url, {
        method: "patch",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
        created++;
      } else {
        Logger.log(
          `Failed to seed result ${fixture.matchId}: ${resp.getContentText()}`,
        );
      }
    });

    return {
      success: true,
      matched,
      created,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    Logger.log(`Initial results seed error: ${error}`);
    return {
      success: false,
      error: error.toString(),
      timestamp: new Date().toISOString(),
    };
  }
}
