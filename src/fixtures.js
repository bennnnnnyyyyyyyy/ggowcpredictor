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
    
    // Process each round
    if (data.rounds) {
      data.rounds.forEach(round => {
        if (round.matches) {
          round.matches.forEach(match => {
            const fixture = {
              matchId: matchId++,
              date: match.date,
              time: match.time,
              stage: round.name,
              team1: match.team1?.name || match.team1,
              team2: match.team2?.name || match.team2,
              group: match.group || null,
              venue: match.venue || null,
              result: null,
              score1: null,
              score2: null,
              status: "scheduled" // scheduled, live, completed
            };
            fixturesToCreate.push(fixture);
          });
        }
      });
    }
    
    Logger.log(`Prepared ${fixturesToCreate.length} fixtures for seeding`);
    
    // TODO: Write to Firebase Firestore collection "fixtures"
    // Once Firebase REST API integration is ready:
    // - POST each fixture to Firebase fixtures collection
    // - Set matchId as document ID
    
    return {
      success: true,
      fixturesSeeded: fixturesToCreate.length,
      timestamp: new Date().toISOString(),
      nextStep: "Firebase integration required"
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
