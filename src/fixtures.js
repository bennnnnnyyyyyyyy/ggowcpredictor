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
      data.matches.forEach(match => {
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
          status: "scheduled" // scheduled, live, completed
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
    
    fixturesToCreate.forEach(fixture => {
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
            createdAt: { timestampValue: new Date().toISOString() }
          }
        };
        
        const options = {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        };
        
        const response = UrlFetchApp.fetch(url, options);
        if (response.getResponseCode() === 201) {
          successCount++;
        } else {
          Logger.log(`Error creating fixture ${fixture.matchId}: ${response.getContentText()}`);
          errorCount++;
        }
      } catch (e) {
        Logger.log(`Exception for fixture ${fixture.matchId}: ${e}`);
        errorCount++;
      }
    });
    
    Logger.log(`Seeding complete: ${successCount} created, ${errorCount} failed`);
    
    return {
      success: true,
      fixturesSeeded: successCount,
      errors: errorCount,
      total: fixturesToCreate.length,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    Logger.log(`Seed error: ${error}`);
    return {
      success: false,
      error: error.toString(),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Fetch live scores from API-Football and update Firebase
 * Called by scheduled trigger every 60 seconds
 */
function fetchAndUpdateLiveScores() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("API_FOOTBALL_KEY");
  if (!apiKey) return { success: false, error: "API_FOOTBALL_KEY not set in Script Properties" };

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
    if (clean === "korearepublic" || clean === "repofkorea" || clean === "koreasouth") return "southkorea";
    if (clean === "unitedstates" || clean === "unitedstatesofamerica") return "usa";
    if (clean === "czechia") return "czechrepublic";
    if (clean === "cotedivoire" || clean === "ivorycoast") return "ivorycoast";
    if (clean === "curaao" || clean === "curacao") return "curacao";
    if (clean === "drcongo" || clean === "congodr" || clean === "democraticrepublicofcongo" || clean === "congodemocraticrepublic") return "drcongo";
    if (clean === "capeverde" || clean === "caboverde") return "capeverde";

    return clean;
  }

  // Fetch all fixtures from Firestore to map team names to matchIds
  let dbFixtures = [];
  try {
    const fixturesResp = UrlFetchApp.fetch(`${base}/fixtures?pageSize=200&key=${fbKey}`, { method: "get", muteHttpExceptions: true });
    const fixturesData = JSON.parse(fixturesResp.getContentText());
    if (fixturesData && fixturesData.documents) {
      dbFixtures = fixturesData.documents.map(doc => {
        const fields = doc.fields || {};
        const get = (k) => fields[k] ? (fields[k].stringValue ?? fields[k].integerValue ?? null) : null;
        return {
          matchId: get("matchId"),
          team1: get("team1"),
          team2: get("team2")
        };
      }).filter(f => f.matchId);
    }
  } catch (err) {
    Logger.log("Error loading DB fixtures for matching: " + err.toString());
  }

  // Fetch today's WC 2026 fixtures from API-Football
  const resp = UrlFetchApp.fetch(
    "https://v3.football.api-sports.io/fixtures?league=1&season=2026&timezone=UTC",
    { headers: { "x-apisports-key": apiKey }, muteHttpExceptions: true }
  );
  const data = JSON.parse(resp.getContentText());
  
  if (data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0)) {
    Logger.log("API-Football errors: " + JSON.stringify(data.errors));
    return { success: false, error: data.errors, scoresUpdated: 0, timestamp: new Date().toISOString() };
  }

  const apiFixtures = data.response || [];

  let updated = 0;
  apiFixtures.forEach(item => {
    const status = item.fixture.status.short; // NS, 1H, HT, 2H, FT, AET, PEN
    const score1 = item.goals.home;
    const score2 = item.goals.away;
    const apiId   = String(item.fixture.id);
    const homeTeam = cleanTeamName(item.teams.home.name);
    const awayTeam = cleanTeamName(item.teams.away.name);

    // Find the matching fixture in our DB
    let targetMatchId = apiId; // Fallback
    const matched = dbFixtures.find(f => {
      const dbHome = cleanTeamName(f.team1);
      const dbAway = cleanTeamName(f.team2);
      return (dbHome === homeTeam && dbAway === awayTeam) ||
             (dbHome === awayTeam && dbAway === homeTeam);
    });

    if (matched) {
      targetMatchId = String(matched.matchId);
    }

    const docId = `match_${targetMatchId}`;
    const url = `${base}/results/${docId}?key=${fbKey}`;
    const payload = {
      fields: {
        matchId:     { stringValue: targetMatchId },
        score1:      score1 !== null ? { integerValue: String(score1) } : { nullValue: null },
        score2:      score2 !== null ? { integerValue: String(score2) } : { nullValue: null },
        status:      { stringValue: status },
        lastUpdated: { stringValue: new Date().toISOString() },
      }
    };
    UrlFetchApp.fetch(url, {
      method: "patch", contentType: "application/json",
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    updated++;
  });

  return { success: true, scoresUpdated: updated, timestamp: new Date().toISOString() };
}
/**
 * Parse worldcup.json structure and extract match details
 * Expected format from openfootball/worldcup.json
 */
function parseWorldcupJSON(jsonData) {
  const parsed = {
    groupStage: [],
    knockout: []
  };
  
  // Group stage matches
  if (jsonData.rounds) {
    jsonData.rounds.forEach(round => {
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
