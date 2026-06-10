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
  try {
    Logger.log("Fetching live scores...");
    
    // TODO: Implement API-Football integration
    // - Call API-Football endpoint for 2026 WC matches
    // - Filter for matches with status "live" or recently completed
    // - Update Firebase results collection with scores
    
    return {
      success: true,
      scoresUpdated: 0,
      timestamp: new Date().toISOString(),
      nextStep: "API-Football integration required"
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
