// Leaderboard calculation logic
// Aggregates Firestore predictions against completed results and updates leaderboard/current.

/**
 * Calculate and update leaderboard for all players.
 * Called by the scheduled trigger daily.
 */
function calculateAndUpdateLeaderboard() {
  try {
    Logger.log("Starting leaderboard calculation...");

    const projectId = "ggowcpredictor";
    const apiKey = firebaseConfig.apiKey;
    const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

    const users = fetchFirestoreCollection(base, apiKey, "users").map((doc) => {
      const f = doc.fields || {};
      const userId = readField(f, "username") || doc.name.split("/").pop();
      return {
        username: String(userId || ""),
        displayName: readField(f, "displayName") || String(userId || ""),
        isAdmin: Boolean(readField(f, "isAdmin")),
      };
    }).filter((user) => user.username);

    const predictions = fetchFirestoreCollection(base, apiKey, "predictions");
    const results = fetchFirestoreCollection(base, apiKey, "results").reduce((acc, doc) => {
      const f = doc.fields || {};
      const matchId = String(
        readField(f, "matchId") ||
          doc.name.split("/").pop().replace(/^match_/, ""),
      );
      acc[matchId] = {
        matchId,
        score1: nullableField(readField(f, "score1")),
        score2: nullableField(readField(f, "score2")),
        status: String(readField(f, "status") || "NS"),
      };
      return acc;
    }, {});

    const scoredMatchCount = Object.values(results).filter(
      (result) =>
        Number.isFinite(result.score1) &&
        Number.isFinite(result.score2) &&
        isFinalStatus(result.status),
    ).length;

    const leaderboard = buildLeaderboard(users, predictions, results);

    Logger.log(`Scored matches available: ${scoredMatchCount}`);
    Logger.log(`Players ranked: ${leaderboard.length}`);

    writeLeaderboardSnapshot(base, apiKey, leaderboard);

    Logger.log("Firestore leaderboard/current updated.");

    return {
      success: true,
      playersScored: leaderboard.length,
      scoredMatches: scoredMatchCount,
      leaderboard,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    Logger.log("Error in calculateAndUpdateLeaderboard: " + error.toString());
    return {
      success: false,
      error: error.toString(),
      timestamp: new Date().toISOString(),
    };
  }
}

function buildLeaderboard(users, predictions, results) {
  const userMap = {};

  users.forEach((user) => {
    userMap[user.username] = {
      username: user.username,
      displayName: user.displayName || user.username,
      isAdmin: Boolean(user.isAdmin),
      totalPoints: 0,
      exactScores: 0,
      correctOutcomes: 0,
      predicted: 0,
    };
  });

  predictions.forEach((doc) => {
    const f = doc.fields || {};
    const username = String(readField(f, "username") || "");
    const matchId = String(readField(f, "matchId") || "");
    const pred1 = nullableField(readField(f, "pred1"));
    const pred2 = nullableField(readField(f, "pred2"));

    if (!username || !matchId || !Number.isFinite(pred1) || !Number.isFinite(pred2)) return;

    if (!userMap[username]) {
      userMap[username] = {
        username,
        displayName: username,
        isAdmin: false,
        totalPoints: 0,
        exactScores: 0,
        correctOutcomes: 0,
        predicted: 0,
      };
    }

    userMap[username].predicted += 1;

    const result = results[matchId];
    if (!result || !Number.isFinite(result.score1) || !Number.isFinite(result.score2)) return;
    if (!isFinalStatus(result.status)) return;

    const points = calculateMatchPoints(pred1, pred2, result.score1, result.score2);
    userMap[username].totalPoints += points;
    if (points === 15) userMap[username].exactScores += 1;
    if (points > 0) userMap[username].correctOutcomes += 1;
  });

  return Object.values(userMap)
    .sort((a, b) =>
      b.totalPoints - a.totalPoints ||
      b.exactScores - a.exactScores ||
      b.correctOutcomes - a.correctOutcomes ||
      b.predicted - a.predicted ||
      a.displayName.localeCompare(b.displayName),
    )
    .map((player, index) => ({
      ...player,
      rank: index + 1,
    }));
}

function writeLeaderboardSnapshot(base, apiKey, leaderboard) {
  const url = `${base}/leaderboard/current?key=${apiKey}`;
  const payload = {
    fields: {
      players: {
        arrayValue: {
          values: leaderboard.map((player) => ({
            mapValue: {
              fields: {
                username: { stringValue: String(player.username || "") },
                displayName: { stringValue: String(player.displayName || player.username || "") },
                isAdmin: { booleanValue: Boolean(player.isAdmin) },
                totalPoints: { integerValue: String(Number(player.totalPoints || 0)) },
                exactScores: { integerValue: String(Number(player.exactScores || 0)) },
                correctOutcomes: { integerValue: String(Number(player.correctOutcomes || 0)) },
                predicted: { integerValue: String(Number(player.predicted || 0)) },
                rank: { integerValue: String(Number(player.rank || 0)) },
              },
            },
          })),
        },
      },
      updatedAt: { stringValue: new Date().toISOString() },
    },
  };

  UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

function fetchFirestoreCollection(base, apiKey, collectionId) {
  const response = UrlFetchApp.fetch(
    `${base}/${collectionId}?pageSize=500&key=${apiKey}`,
    { method: "get", muteHttpExceptions: true },
  );
  const data = JSON.parse(response.getContentText());
  return data.documents || [];
}

function readField(fields, key) {
  if (!fields || !fields[key]) return null;
  const field = fields[key];
  return field.stringValue ?? field.integerValue ?? field.doubleValue ?? field.booleanValue ?? field.nullValue ?? null;
}

function nullableField(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isFinalStatus(status) {
  const value = String(status || "").toUpperCase();
  return ["FT", "AET", "PEN", "FINAL", "COMPLETED"].includes(value);
}

function calculateMatchPoints(p1, p2, a1, a2) {
  if (p1 === a1 && p2 === a2) return 15;

  const predOutcome = Math.sign(p1 - p2);
  const actualOutcome = Math.sign(a1 - a2);

  if (predOutcome === actualOutcome) {
    const diffGap = Math.abs((p1 - p2) - (a1 - a2));
    return diffGap <= 1 ? 8 : 5;
  }

  const totalGap = Math.abs(p1 - a1) + Math.abs(p2 - a2);
  return totalGap <= 2 ? 3 : 0;
}
