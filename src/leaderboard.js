// leaderboard.gs
// Reads predictions + results from Firestore, scores every player,
// writes results to two Sheets tabs (Scores, Leaderboard) and back
// to Firestore leaderboard/current so the website can consume it.
//
// Trigger: scheduledLeaderboardUpdate() every 30 minutes.

// ─── Scoring (mirrors app.js calculateMatchPoints exactly) ──────────────────

function scoreMatch_(p1, p2, a1, a2) {
  if (p1 === a1 && p2 === a2) return 15;

  const predOutcome = Math.sign(p1 - p2);
  const actualOutcome = Math.sign(a1 - a2);

  if (predOutcome === actualOutcome) {
    const diffGap = Math.abs((p1 - p2) - (a1 - a2));
    return diffGap <= 1 ? 8 : 5;
  }

  // Wrong outcome — partial credit if total goal gap ≤ 2
  const totalGap = Math.abs(p1 - a1) + Math.abs(p2 - a2);
  return totalGap <= 2 ? 3 : 0;
}

// ─── Firestore helpers ───────────────────────────────────────────────────────

function fsBase_() {
  const pid = firebaseConfig.projectId;
  return `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
}

function fsGet_(collection, pageSize) {
  pageSize = pageSize || 500;
  const url = `${fsBase_()}/${collection}?pageSize=${pageSize}&key=${firebaseConfig.apiKey}`;
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(resp.getContentText());
  return data.documents || [];
}

function fsPatch_(collection, docId, fields) {
  const url = `${fsBase_()}/${collection}/${docId}?key=${firebaseConfig.apiKey}`;
  UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true,
  });
}

// Extract a scalar value from a Firestore field map entry
function fsVal_(entry) {
  if (!entry) return null;
  return entry.stringValue !== undefined ? entry.stringValue
    : entry.integerValue !== undefined ? Number(entry.integerValue)
      : entry.doubleValue !== undefined ? Number(entry.doubleValue)
        : entry.booleanValue !== undefined ? entry.booleanValue
          : null;
}

// ─── Main: build and persist leaderboard ────────────────────────────────────

function calculateAndUpdateLeaderboard() {
  const base = fsBase_();
  const apiKey = firebaseConfig.apiKey;

  // 1. Load results (only FT / AET / PEN qualify for points)
  const FINAL_STATUSES = ["FT", "AET", "PEN", "COMPLETED", "FINAL"];
  const resultDocs = fsGet_("results");
  const results = {};                        // keyed by matchId (string)

  resultDocs.forEach(function (doc) {
    const f = doc.fields || {};
    const matchId = String(fsVal_(f.matchId) || "");
    const status = String(fsVal_(f.status) || "").toUpperCase();
    const s1 = fsVal_(f.score1);
    const s2 = fsVal_(f.score2);
    if (!matchId || s1 === null || s2 === null) return;
    if (!FINAL_STATUSES.includes(status)) return;
    results[matchId] = { score1: Number(s1), score2: Number(s2), status };
  });

  const scoredMatches = Object.keys(results).length;
  Logger.log("Scored matches available: " + scoredMatches);

  // 2. Load predictions
  const predDocs = fsGet_("predictions");

  // 3. Load users for display names
  const userDocs = fsGet_("users");
  const displayNames = {};
  userDocs.forEach(function (doc) {
    const f = doc.fields || {};
    const username = doc.name.split("/").pop();
    displayNames[username] = fsVal_(f.displayName) || username;
  });

  // 4. Aggregate per-user stats
  const userMap = {};   // username → stats object

  predDocs.forEach(function (doc) {
    const f = doc.fields || {};
    const username = String(fsVal_(f.username) || "");
    const matchId = String(fsVal_(f.matchId) || "");
    const pred1 = Number(fsVal_(f.pred1));
    const pred2 = Number(fsVal_(f.pred2));

    if (!username || !matchId) return;
    if (isNaN(pred1) || isNaN(pred2)) return;

    if (!userMap[username]) {
      userMap[username] = {
        username,
        displayName: displayNames[username] || username,
        totalPoints: 0,
        exactScores: 0,   // 15-pt hits
        correctOutcomes: 0,   // any positive score
        predicted: 0,   // total predictions placed
        scored: 0,   // predictions against a final result
      };
    }

    userMap[username].predicted++;

    const result = results[matchId];
    if (!result) return;           // match not yet final

    const pts = scoreMatch_(pred1, pred2, result.score1, result.score2);
    userMap[username].totalPoints += pts;
    userMap[username].scored++;
    if (pts === 15) userMap[username].exactScores++;
    if (pts > 0) userMap[username].correctOutcomes++;
  });

  // 5. Sort and rank
  const ranked = Object.values(userMap)
    .sort(function (a, b) {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
      return b.correctOutcomes - a.correctOutcomes;
    })
    .map(function (p, i) { return Object.assign({}, p, { rank: i + 1 }); });

  Logger.log("Players ranked: " + ranked.length);

  // 6. Write to Google Sheets
  writeToSheets_(ranked, results);

  // 7. Write back to Firestore leaderboard/current
  writeToFirestore_(ranked);

  return {
    success: true,
    playersScored: ranked.length,
    scoredMatches,
    timestamp: new Date().toISOString(),
  };
}

// ─── Sheet writer ────────────────────────────────────────────────────────────

function writeToSheets_(ranked, results) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Tab 1: Leaderboard ───────────────────────────────────────────────────
  const lbTab = getOrCreateSheet_(ss, "Leaderboard");
  lbTab.clearContents();

  const lbHeaders = ["Rank", "Player", "Username", "Total Pts",
    "Exact Scores", "Correct Outcomes", "Predictions"];
  lbTab.getRange(1, 1, 1, lbHeaders.length).setValues([lbHeaders]);
  styleHeader_(lbTab, lbHeaders.length);

  if (ranked.length) {
    const lbRows = ranked.map(function (p) {
      return [p.rank, p.displayName, p.username,
      p.totalPoints, p.exactScores, p.correctOutcomes, p.predicted];
    });
    lbTab.getRange(2, 1, lbRows.length, lbHeaders.length).setValues(lbRows);
    highlightTopThree_(lbTab, lbRows.length);
  }

  lbTab.autoResizeColumns(1, lbHeaders.length);
  lbTab.getRange("A1").getSheet()
    .getRange(1, 1, 1, 1)                  // timestamp note in A1 note
    .setNote("Last updated: " + new Date().toLocaleString());

  // ── Tab 2: Scores (per-match breakdown) ──────────────────────────────────
  // Rebuild from Firestore predictions so we get one row per prediction
  const predDocs = fsGet_("predictions");
  const scoresTab = getOrCreateSheet_(ss, "Scores");
  scoresTab.clearContents();

  const scHeaders = ["Username", "Match ID", "Pred Home", "Pred Away",
    "Actual Home", "Actual Away", "Status", "Points"];
  scoresTab.getRange(1, 1, 1, scHeaders.length).setValues([scHeaders]);
  styleHeader_(scoresTab, scHeaders.length);

  const FINAL_STATUSES = ["FT", "AET", "PEN", "COMPLETED", "FINAL"];
  const scRows = [];

  predDocs.forEach(function (doc) {
    const f = doc.fields || {};
    const username = String(fsVal_(f.username) || "");
    const matchId = String(fsVal_(f.matchId) || "");
    const pred1 = Number(fsVal_(f.pred1));
    const pred2 = Number(fsVal_(f.pred2));
    if (!username || !matchId || isNaN(pred1) || isNaN(pred2)) return;

    const result = results[matchId];
    const isFinal = result && FINAL_STATUSES.includes(result.status);
    const pts = isFinal ? scoreMatch_(pred1, pred2, result.score1, result.score2) : "";

    scRows.push([
      username,
      matchId,
      pred1,
      pred2,
      result ? result.score1 : "",
      result ? result.score2 : "",
      result ? result.status : "NS",
      pts,
    ]);
  });

  // Sort: username asc, then matchId asc
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

// ─── Firestore writer ────────────────────────────────────────────────────────

function writeToFirestore_(ranked) {
  // Firestore can't store arrays of objects natively in a single field without
  // the Admin SDK, so we serialise to JSON string and store it as stringValue.
  // The website's loadLeaderboard() already reads leaderboard/current.players
  // as an array — so we use an arrayValue instead.

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

// ─── Sheet helpers ───────────────────────────────────────────────────────────

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function styleHeader_(sheet, numCols) {
  const hdr = sheet.getRange(1, 1, 1, numCols);
  hdr.setFontWeight("bold")
    .setBackground("#1a1a2e")
    .setFontColor("#ffffff");
  sheet.setFrozenRows(1);
}

function highlightTopThree_(sheet, numRows) {
  if (numRows < 1) return;
  const colours = ["#FFD700", "#C0C0C0", "#CD7F32"];   // gold, silver, bronze
  for (var i = 0; i < Math.min(3, numRows); i++) {
    sheet.getRange(i + 2, 1, 1, 7).setBackground(colours[i]);
  }
}

// ─── Scheduled trigger entry point ──────────────────────────────────────────

function scheduledLeaderboardUpdate() {
  try {
    Logger.log("=== Leaderboard update started ===");
    const result = calculateAndUpdateLeaderboard();
    Logger.log("=== Done: " + JSON.stringify(result) + " ===");
  } catch (err) {
    Logger.log("scheduledLeaderboardUpdate ERROR: " + err.toString());
  }
}