// Fixtures seeding logic
// Reads from openfootball/worldcup.json and populates Firebase

/**
 * Seed all 104 WC 2026 fixtures from JSON source
 * Reads from the 2026 folder cloned from openfootball repo
 */
/**
 * Seed WC 2026 fixtures into Firestore.
 * @param {Object|null} inlinePayload - Optional JSON payload {matches:[...]}. If omitted, reads from Google Drive.
 */
function seedFixturesFromJSON(inlinePayload) {
  try {
    Logger.log('Starting fixture seed process...');

    var data;
    if (inlinePayload) {
      data = (typeof inlinePayload === 'string') ? JSON.parse(inlinePayload) : inlinePayload;
    } else {
      var file = DriveApp.getFilesByName('worldcup.json').next();
      data = JSON.parse(file.getBlob().getDataAsString());
    }

    var projectId = firebaseConfig.projectId;
    var apiKey    = firebaseConfig.apiKey;
    var base      = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents';

    var matchId      = 1;
    var successCount = 0;
    var errorCount   = 0;

    (data.matches || []).forEach(function(match) {
      var docId   = 'match_' + matchId;
      var url     = base + '/fixtures/' + docId + '?key=' + apiKey;
      var stage   = getStageKey(match.round || '');
      var payload = {
        fields: {
          matchId:    { integerValue: String(matchId) },
          date:       { stringValue: match.date   || '' },
          time:       { stringValue: match.time   || '' },
          round:      { stringValue: match.round  || '' },
          stage:      { stringValue: stage },
          team1:      { stringValue: match.team1  || 'TBD' },
          team2:      { stringValue: match.team2  || 'TBD' },
          group:      { stringValue: match.group  || '' },
          ground:     { stringValue: match.ground || '' },
          kickoffUTC: { stringValue: match.kickoffUTC || '' },
          score1:     { nullValue: null },
          score2:     { nullValue: null },
          status:     { stringValue: 'NS' },
          createdAt:  { timestampValue: new Date().toISOString() }
        }
      };

      var resp = UrlFetchApp.fetch(url, {
        method: 'patch',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      var code = resp.getResponseCode();
      if (code === 200 || code === 201) {
        successCount++;
      } else {
        Logger.log('Error seeding fixture ' + matchId + ': ' + resp.getContentText());
        errorCount++;
      }
      matchId++;
    });

    Logger.log('Seeding complete: ' + successCount + ' written, ' + errorCount + ' failed');
    return { success: true, fixturesSeeded: successCount, errors: errorCount, total: matchId - 1, timestamp: new Date().toISOString() };

  } catch (error) {
    Logger.log('Seed error: ' + error);
    return { success: false, error: error.toString(), timestamp: new Date().toISOString() };
  }
}

/** Map a round string to a stage key (mirrors the frontend getStageFromRound). */
function getStageKey(round) {
  var v = String(round).toLowerCase();
  if (v.indexOf('group') !== -1 || v.indexOf('matchday') !== -1) return 'group';
  if (v.indexOf('32')    !== -1) return 'r32';
  if (v.indexOf('16')    !== -1) return 'r16';
  if (v.indexOf('quarter') !== -1) return 'qf';
  if (v.indexOf('semi')    !== -1) return 'sf';
  if (v.indexOf('third')   !== -1) return 'third';
  if (v.indexOf('final')   !== -1) return 'final';
  return 'group';
}

/**
 * Fetch live scores from API-Football and update Firebase
 * Called by scheduled trigger every 60 seconds
 */
/**
 * Fetch live scores from API-Football and update Firestore via self-healing matchId bridge.
 *
 * Algorithm:
 *   1. Load all Firestore fixture docs to build a lookup keyed by normalised "team1|team2|date".
 *   2. Fetch today's WC 2026 fixtures from API-Football.
 *   3. For each API fixture, find the matching local fixture by normalised team names + date.
 *   4. Write the result to results/match_{localMatchId}.
 *   5. Back-fill apiFixtureId on the fixture document so future runs resolve by ID (fast path).
 */
function fetchAndUpdateLiveScores() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('API_FOOTBALL_KEY');
  if (!apiKey) return { success: false, error: 'API_FOOTBALL_KEY not set in Script Properties' };

  var projectId = firebaseConfig.projectId;
  var fbKey     = firebaseConfig.apiKey;
  var base      = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents';

  // --- Step 1: Build local fixture lookup ---
  var fixResp    = UrlFetchApp.fetch(base + '/fixtures?pageSize=500&key=' + fbKey, { muteHttpExceptions: true });
  var fixDocs    = JSON.parse(fixResp.getContentText()).documents || [];

  // key: normalizedTeam1 + '|' + normalizedTeam2 + '|' + dateStr  -> { matchId, docPath, apiFixtureId }
  var byNameDate = {};
  // fast path: key: apiFixtureId -> { matchId, docPath }
  var byApiId    = {};

  fixDocs.forEach(function(doc) {
    var f  = doc.fields || {};
    var fv = function(k) { return f[k] ? (f[k].stringValue || f[k].integerValue || '') : ''; };
    var matchId       = String(fv('matchId'));
    var apiFixtureId  = fv('apiFixtureId');
    var team1         = normalizeTeamName(fv('team1'));
    var team2         = normalizeTeamName(fv('team2'));
    var dateStr       = String(fv('kickoffUTC') || fv('date') || '').substring(0, 10);
    var key           = team1 + '|' + team2 + '|' + dateStr;
    var entry         = { matchId: matchId, docName: doc.name };
    byNameDate[key]   = entry;
    if (apiFixtureId) byApiId[apiFixtureId] = entry;
  });

  // --- Step 2: Fetch API-Football results ---
  var resp        = UrlFetchApp.fetch(
    'https://v3.football.api-sports.io/fixtures?league=1&season=2026&timezone=UTC',
    { headers: { 'x-apisports-key': apiKey }, muteHttpExceptions: true }
  );
  var apiFixtures = JSON.parse(resp.getContentText()).response || [];

  var updated = 0;
  var skipped = 0;

  apiFixtures.forEach(function(item) {
    var status    = item.fixture.status.short;
    var score1    = item.goals.home;
    var score2    = item.goals.away;
    var apiId     = String(item.fixture.id);
    var apiDate   = String(item.fixture.date || '').substring(0, 10);
    var apiTeam1  = normalizeTeamName(item.teams.home.name);
    var apiTeam2  = normalizeTeamName(item.teams.away.name);

    // Resolve local fixture: fast path via stored apiFixtureId, then by name+date
    var entry = byApiId[apiId] || byNameDate[apiTeam1 + '|' + apiTeam2 + '|' + apiDate];
    if (!entry) {
      skipped++;
      Logger.log('No local fixture found for API id=' + apiId + ' (' + apiTeam1 + ' v ' + apiTeam2 + ' ' + apiDate + ')');
      return;
    }

    var localMatchId = entry.matchId;

    // --- Step 4: Write result ---
    var resultUrl = base + '/results/match_' + localMatchId + '?key=' + fbKey;
    var resultPayload = {
      fields: {
        matchId:      { stringValue: localMatchId },
        apiFixtureId: { stringValue: apiId },
        score1:       score1 !== null ? { integerValue: String(score1) } : { nullValue: null },
        score2:       score2 !== null ? { integerValue: String(score2) } : { nullValue: null },
        status:       { stringValue: status },
        lastUpdated:  { stringValue: new Date().toISOString() }
      }
    };
    UrlFetchApp.fetch(resultUrl, {
      method: 'patch', contentType: 'application/json',
      payload: JSON.stringify(resultPayload), muteHttpExceptions: true
    });

    // --- Step 5: Back-fill apiFixtureId on the fixture if not already set ---
    if (!byApiId[apiId]) {
      var fixtureUrl = base + '/' + entry.docName.split('/documents/')[1] + '?updateMask.fieldPaths=apiFixtureId&key=' + fbKey;
      UrlFetchApp.fetch(fixtureUrl, {
        method: 'patch', contentType: 'application/json',
        payload: JSON.stringify({ fields: { apiFixtureId: { stringValue: apiId } } }),
        muteHttpExceptions: true
      });
      // Register in fast-path cache for remainder of this run
      byApiId[apiId] = entry;
    }

    updated++;
  });

  Logger.log('Live scores sync: ' + updated + ' updated, ' + skipped + ' skipped');
  return { success: true, scoresUpdated: updated, skipped: skipped, timestamp: new Date().toISOString() };
}

/** Normalise a team name to a lowercase alphanumeric key for fuzzy matching. */
function normalizeTeamName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
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
