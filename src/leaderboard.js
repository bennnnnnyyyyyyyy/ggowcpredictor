// leaderboard.gs
// Reads predictions + results, scores every player, writes Sheets tabs and
// persists leaderboard/current to Firestore with Supabase fallback.
//
// Trigger: scheduledLeaderboardUpdate() every 30 minutes.

const FINAL_STATUSES = ["FT", "AET", "PEN", "COMPLETED", "FINAL"];

// Scoring mirrors scripts/app.js calculateMatchPoints.
function scoreMatch_(p1, p2, a1, a2) {
  if (p1 === a1 && p2 === a2) return 15;

  const predOutcome = Math.sign(p1 - p2);
  const actualOutcome = Math.sign(a1 - a2);

  if (predOutcome === actualOutcome) {
    const diffGap = Math.abs(p1 - p2 - (a1 - a2));
    return diffGap <= 1 ? 8 : 5;
  }

  const totalGap = Math.abs(p1 - a1) + Math.abs(p2 - a2);
  return totalGap <= 2 ? 3 : 0;
}

function fsBase_() {
  const pid = firebaseConfig.projectId;
  return `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
}

function fsGet_(collection, pageSize) {
  pageSize = pageSize || 500;
  let pageToken = "";
  const documents = [];

  while (true) {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `${fsBase_()}/${collection}?pageSize=${pageSize}${tokenParam}&key=${firebaseConfig.apiKey}`;
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = resp.getResponseCode();
    const body = resp.getContentText();

    if (code < 200 || code >= 300) {
      const error = new Error(`Firestore ${collection} failed with HTTP ${code}: ${body}`);
      error.statusCode = code;
      throw error;
    }

    const data = JSON.parse(body || "{}");
    documents.push.apply(documents, data.documents || []);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return documents;
}

function fsPatch_(collection, docId, fields) {
  const url = `${fsBase_()}/${collection}/${docId}?key=${firebaseConfig.apiKey}`;
  const resp = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(
      `Firestore write ${collection}/${docId} failed with HTTP ${code}: ${resp.getContentText()}`,
    );
  }
}

function fsVal_(entry) {
  if (!entry) return null;
  if (entry.stringValue !== undefined) return entry.stringValue;
  if (entry.integerValue !== undefined) return Number(entry.integerValue);
  if (entry.doubleValue !== undefined) return Number(entry.doubleValue);
  if (entry.booleanValue !== undefined) return entry.booleanValue;
  if (entry.timestampValue !== undefined) return entry.timestampValue;
  if (entry.nullValue !== undefined) return null;
  return null;
}

function firestoreDocId_(doc) {
  return String(doc.name || "").split("/").pop();
}

function firestoreDocToRow_(doc) {
  const row = { id: firestoreDocId_(doc) };
  const fields = doc.fields || {};
  Object.keys(fields).forEach(function (key) {
    row[key] = fsVal_(fields[key]);
  });
  return row;
}

function loadCollectionRows_(collection, options) {
  options = options || {};

  try {
    const docs = fsGet_(collection, options.pageSize || 500);
    return docs.map(firestoreDocToRow_);
  } catch (error) {
    Logger.log(
      `[FALLBACK] Firestore ${collection} unavailable (${error.message}). Trying Supabase.`,
    );
    try {
      return fetchSupabaseCollection(collection);
    } catch (supabaseError) {
      Logger.log(
        `[FALLBACK] Supabase ${collection} unavailable (${supabaseError.message}).`,
      );
      if (options.optional) return [];
      throw supabaseError;
    }
  }
}

function buildLeaderboardSnapshot_(sourceRows) {
  sourceRows = sourceRows || {};
  const resultRows = sourceRows.results || loadCollectionRows_("results");
  const predictionRows = sourceRows.predictions || loadCollectionRows_("predictions");
  const userRows = sourceRows.users || loadCollectionRows_("users");

  const displayNames = {};
  userRows.forEach(function (user) {
    const username = String(user.username || user.id || "").trim();
    if (username) displayNames[username] = user.displayName || username;
  });

  const results = {};
  resultRows.forEach(function (result) {
    const matchId = String(result.matchId || result.id || "").replace(/^match_/, "");
    const status = String(result.status || "").toUpperCase();
    const score1 = nullableNumber_(result.score1);
    const score2 = nullableNumber_(result.score2);
    if (!matchId || score1 === null || score2 === null) return;
    if (!FINAL_STATUSES.includes(status)) return;
    results[matchId] = { matchId, score1, score2, status };
  });

  const userMap = {};
  predictionRows.forEach(function (prediction) {
    const username = String(prediction.username || "").trim();
    const matchId = String(prediction.matchId || "").replace(/^match_/, "");
    const pred1 = nullableNumber_(prediction.pred1);
    const pred2 = nullableNumber_(prediction.pred2);

    if (!username || !matchId || pred1 === null || pred2 === null) return;

    if (!userMap[username]) {
      userMap[username] = {
        username,
        displayName: displayNames[username] || username,
        totalPoints: 0,
        exactScores: 0,
        correctOutcomes: 0,
        predicted: 0,
        scored: 0,
      };
    }

    userMap[username].predicted++;
    const result = results[matchId];
    if (!result) return;

    const points = scoreMatch_(pred1, pred2, result.score1, result.score2);
    userMap[username].totalPoints += points;
    userMap[username].scored++;
    if (points === 15) userMap[username].exactScores++;
    if (points > 0) userMap[username].correctOutcomes++;
  });

  const ranked = Object.values(userMap)
    .sort(function (a, b) {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
      if (b.correctOutcomes !== a.correctOutcomes) return b.correctOutcomes - a.correctOutcomes;
      return a.username.localeCompare(b.username);
    })
    .map(function (player, index) {
      return Object.assign({}, player, { rank: index + 1 });
    });

  return {
    leaderboard: ranked,
    predictions: predictionRows,
    results,
    scoredMatches: Object.keys(results).length,
    timestamp: new Date().toISOString(),
  };
}

function getLeaderboardSnapshot() {
  const snapshot = buildLeaderboardSnapshot_();
  return {
    leaderboard: snapshot.leaderboard,
    scoredMatches: snapshot.scoredMatches,
    timestamp: snapshot.timestamp,
  };
}

function calculateAndUpdateLeaderboard() {
  const snapshot = buildLeaderboardSnapshot_();
  Logger.log("Scored matches available: " + snapshot.scoredMatches);
  Logger.log("Players ranked: " + snapshot.leaderboard.length);

  writeToSheets_(snapshot.leaderboard, snapshot.results, snapshot.predictions);
  persistLeaderboard_(snapshot.leaderboard);

  return {
    success: true,
    playersScored: snapshot.leaderboard.length,
    scoredMatches: snapshot.scoredMatches,
    timestamp: snapshot.timestamp,
  };
}

function writeToSheets_(ranked, results, predictions) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const lbTab = getOrCreateSheet_(ss, "Leaderboard");
  lbTab.clearContents();

  const lbHeaders = [
    "Rank",
    "Player",
    "Username",
    "Total Pts",
    "Exact Scores",
    "Correct Outcomes",
    "Predictions",
    "Scored",
  ];
  lbTab.getRange(1, 1, 1, lbHeaders.length).setValues([lbHeaders]);
  styleHeader_(lbTab, lbHeaders.length);

  if (ranked.length) {
    const lbRows = ranked.map(function (p) {
      return [
        p.rank,
        p.displayName,
        p.username,
        p.totalPoints,
        p.exactScores,
        p.correctOutcomes,
        p.predicted,
        p.scored,
      ];
    });
    lbTab.getRange(2, 1, lbRows.length, lbHeaders.length).setValues(lbRows);
    highlightTopThree_(lbTab, lbRows.length, lbHeaders.length);
  }

  lbTab.autoResizeColumns(1, lbHeaders.length);
  lbTab.getRange(1, 1, 1, 1).setNote("Last updated: " + new Date().toLocaleString());

  const scoresTab = getOrCreateSheet_(ss, "Scores");
  scoresTab.clearContents();

  const scHeaders = [
    "Username",
    "Match ID",
    "Pred Home",
    "Pred Away",
    "Actual Home",
    "Actual Away",
    "Status",
    "Points",
  ];
  scoresTab.getRange(1, 1, 1, scHeaders.length).setValues([scHeaders]);
  styleHeader_(scoresTab, scHeaders.length);

  const scRows = [];
  predictions.forEach(function (prediction) {
    const username = String(prediction.username || "");
    const matchId = String(prediction.matchId || "").replace(/^match_/, "");
    const pred1 = nullableNumber_(prediction.pred1);
    const pred2 = nullableNumber_(prediction.pred2);
    if (!username || !matchId || pred1 === null || pred2 === null) return;

    const result = results[matchId];
    const points = result ? scoreMatch_(pred1, pred2, result.score1, result.score2) : "";

    scRows.push([
      username,
      matchId,
      pred1,
      pred2,
      result ? result.score1 : "",
      result ? result.score2 : "",
      result ? result.status : "NS",
      points,
    ]);
  });

  scRows.sort(function (a, b) {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return Number(a[1]) - Number(b[1]);
  });

  if (scRows.length) {
    scoresTab.getRange(2, 1, scRows.length, scHeaders.length).setValues(scRows);
  }
  scoresTab.autoResizeColumns(1, scHeaders.length);
}

function persistLeaderboard_(ranked) {
  try {
    writeToFirestore_(ranked);
  } catch (error) {
    Logger.log(`[FALLBACK] Firestore leaderboard write failed: ${error.message}`);
  }

  try {
    writeToSupabaseBackup(
      "leaderboard",
      ranked.map(function (player) {
        return Object.assign({}, player, { updatedAt: new Date().toISOString() });
      }),
    );
    Logger.log("Supabase leaderboard table updated.");
  } catch (error) {
    Logger.log(`[FALLBACK] Supabase leaderboard write failed: ${error.message}`);
  }
}

function writeToFirestore_(ranked) {
  const playerValues = ranked.map(function (p) {
    return {
      mapValue: {
        fields: {
          rank: { integerValue: String(p.rank) },
          username: { stringValue: p.username },
          displayName: { stringValue: p.displayName },
          totalPoints: { integerValue: String(p.totalPoints) },
          exactScores: { integerValue: String(p.exactScores) },
          correctOutcomes: { integerValue: String(p.correctOutcomes) },
          predicted: { integerValue: String(p.predicted) },
          scored: { integerValue: String(p.scored) },
        },
      },
    };
  });

  const fields = {
    players: { arrayValue: { values: playerValues.length ? playerValues : [] } },
    updatedAt: { stringValue: new Date().toISOString() },
    playerCount: { integerValue: String(ranked.length) },
  };

  fsPatch_("leaderboard", "current", fields);
  Logger.log("Firestore leaderboard/current updated.");
}

function migrateFirestoreToSupabase() {
  const collections = ["users", "fixtures", "predictions", "results"];
  const summary = {};

  collections.forEach(function (collection) {
    const rows = fsGet_(collection).map(firestoreDocToRow_);
    const normalized = rows
      .map(function (row) {
        return normalizeSupabaseRow_(collection, row);
      })
      .filter(Boolean);
    writeToSupabaseBackup(collection, normalized);
    summary[collection] = normalized.length;
  });

  Logger.log("Firestore to Supabase migration complete: " + JSON.stringify(summary));
  return {
    success: true,
    migrated: summary,
    timestamp: new Date().toISOString(),
  };
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function styleHeader_(sheet, numCols) {
  const hdr = sheet.getRange(1, 1, 1, numCols);
  hdr.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
  sheet.setFrozenRows(1);
}

function highlightTopThree_(sheet, numRows, numCols) {
  if (numRows < 1) return;
  const colours = ["#FFD700", "#C0C0C0", "#CD7F32"];
  for (var i = 0; i < Math.min(3, numRows); i++) {
    sheet.getRange(i + 2, 1, 1, numCols || 8).setBackground(colours[i]);
  }
}

function scheduledLeaderboardUpdate() {
  try {
    Logger.log("=== Leaderboard update started ===");
    const result = calculateAndUpdateLeaderboard();
    Logger.log("=== Done: " + JSON.stringify(result) + " ===");
  } catch (err) {
    Logger.log("scheduledLeaderboardUpdate ERROR: " + err.toString());
  }
}
