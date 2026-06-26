// GGO WC 2026 — Cloudflare Worker Backend
// Primary API: Supabase reads/writes, Firestore backup, leaderboard engine.

const WORLDCUP26_GAMES_URL = "https://worldcup26.ir/get/games";
const WORLDCUP26_GROUPS_URL = "https://worldcup26.ir/get/groups";
const WORLDCUP26_TEAMS_URL = "https://worldcup26.ir/get/teams";
const ZAFRONIX_URL =
  "https://api.zafronix.com/fifa/worldcup/v1/tournaments/2026/matches";
const LIVESCORE_FIXTURES_URL =
  "https://livescore-api.com/api-client/fixtures/matches.json?competition_id=362";
const LIVESCORE_LIVE_URL =
  "https://livescore-api.com/api-client/matches/live.json?competition_id=362";

const FINAL_STATUSES = ["FT", "AET", "PEN", "COMPLETED", "FINAL"];

// ─── Supabase REST helpers ──────────────────────────────────────────────────

function supabaseHeaders(env, extra) {
  const key =
    env.SUPABASE_SERVICE_KEY ||
    env.SUPABASE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Object.assign(
    {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    extra || {},
  );
}

function supabaseUrl(env, table, query) {
  const urlVal = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const base = String(urlVal || "")
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");
  const suffix = query ? `?${query}` : "";
  return `${base}/rest/v1/${table}${suffix}`;
}

async function supabaseSelect(env, table, query) {
  const url = supabaseUrl(
    env,
    table,
    `select=${encodeURIComponent(query || "*")}`,
  );
  const allRows = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    const response = await fetch(url, {
      headers: supabaseHeaders(env, {
        Range: `${start}-${end}`,
      }),
    });
    if (!response.ok) {
      throw new Error(`Supabase GET ${table} HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(
        `Expected array from Supabase select, got: ${typeof data}`,
      );
    }
    allRows.push(...data);
    if (data.length < pageSize) {
      break;
    }
    page++;
  }
  return allRows;
}

const SUPABASE_CONFLICT_KEYS = {
  fixtures: "matchId",
  results: "matchId",
  predictions: "id",
  users: "username",
  leaderboard: "username",
  accountRequests: "username",
  group_standings: "group_name,team_id",
};

async function supabaseUpsert(env, table, rows) {
  const rowList = Array.isArray(rows) ? rows : [rows];
  if (!rowList.length) return 0;
  const conflictKey = SUPABASE_CONFLICT_KEYS[table] || "";
  const query = conflictKey
    ? `on_conflict=${encodeURIComponent(conflictKey)}`
    : "";
  const response = await fetch(supabaseUrl(env, table, query), {
    method: "POST",
    headers: supabaseHeaders(env, {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(rowList),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Supabase upsert ${table} HTTP ${response.status}: ${text}`,
    );
  }
  return rowList.length;
}

// ─── Firestore REST helpers (backup / fallback) ─────────────────────────────

async function firestoreCollection(env, collectionId) {
  const projectId = env.FIREBASE_PROJECT_ID || "ggowcpredictor";
  const serviceAccount = parseJsonSecret(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!serviceAccount) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");

  const token = await getAccessToken(serviceAccount);
  const allDocs = [];
  let pageToken = "";

  while (true) {
    const tokenParam = pageToken
      ? `&pageToken=${encodeURIComponent(pageToken)}`
      : "";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}?pageSize=500${tokenParam}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Firestore HTTP ${response.status}`);
    const data = await response.json();
    const docs = (data.documents || []).map(firestoreDocToRow);
    allDocs.push(...docs);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return allDocs;
}

function firestoreDocToRow(doc) {
  const row = {
    id: String(doc.name || "")
      .split("/")
      .pop(),
  };
  const fields = doc.fields || {};
  for (const key of Object.keys(fields)) {
    row[key] = readFirestoreField(fields[key]);
  }
  return row;
}

function readFirestoreField(entry) {
  if (!entry) return null;
  if (entry.stringValue !== undefined) return entry.stringValue;
  if (entry.integerValue !== undefined) return Number(entry.integerValue);
  if (entry.doubleValue !== undefined) return Number(entry.doubleValue);
  if (entry.booleanValue !== undefined) return entry.booleanValue;
  if (entry.timestampValue !== undefined) return entry.timestampValue;
  if (entry.nullValue !== undefined) return null;
  if (entry.arrayValue) {
    return (entry.arrayValue.values || []).map(readFirestoreField);
  }
  if (entry.mapValue) {
    const obj = {};
    for (const [k, v] of Object.entries(entry.mapValue.fields || {})) {
      obj[k] = readFirestoreField(v);
    }
    return obj;
  }
  return null;
}

async function firestoreBatchWrite(env, collection, updates) {
  const projectId = env.FIREBASE_PROJECT_ID || "ggowcpredictor";
  const serviceAccount = parseJsonSecret(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!serviceAccount) return;
  const token = await getAccessToken(serviceAccount);

  const writes = updates.map((update) => ({
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${collection}/${update._docId}`,
      fields: convertToFirestoreFields(update),
    },
  }));

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchWrite`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ writes }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.warn(`Firestore batchWrite failed ${response.status}: ${text}`);
  }
}

function convertToFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_docId") continue;
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function loadCollection(env, table) {
  try {
    const rows = await supabaseSelect(env, table);
    if (rows && rows.length) return rows;
  } catch (error) {
    console.warn(`Supabase ${table} unavailable: ${error.message}`);
  }

  try {
    return await firestoreCollection(env, table);
  } catch (error) {
    console.warn(`Firestore ${table} also unavailable: ${error.message}`);
  }

  return [];
}

// ─── Email Notifications (via Google Apps Script relay) ─────────────────────
//
// Set these as Cloudflare Worker secrets:
//   wrangler secret put GAS_WEB_APP_URL   ← your deployed GAS web app URL
//   wrangler secret put GAS_EMAIL_TOKEN   ← shared secret matching EMAIL_TOKEN in GAS Script Properties

async function sendEmailViaGas(env, payload) {
  const gasUrl = env.GAS_WEB_APP_URL;
  const token = env.GAS_EMAIL_TOKEN;
  if (!gasUrl || !token) {
    console.warn("Email skipped: GAS_WEB_APP_URL or GAS_EMAIL_TOKEN not set.");
    return;
  }
  try {
    const resp = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, token }),
      redirect: "follow",
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`GAS email failed (${resp.status}): ${text}`);
    }
  } catch (err) {
    console.warn("GAS email network error:", err.message);
  }
}

// ─── Leaderboard Calculation Engine ─────────────────────────────────────────

const STAGE_MULTIPLIERS = {
  group: 1,
  r32: 2,
  r16: 2.5,
  qf: 3,
  sf: 4,
  third: 4,
  final: 5,
};

function scoreMatch(p1, p2, a1, a2, stage = "group") {
  const multiplier =
    STAGE_MULTIPLIERS[String(stage || "group").toLowerCase()] ?? 1;
  if (p1 === a1 && p2 === a2) return 15 * multiplier;
  const predOutcome = Math.sign(p1 - p2);
  const actualOutcome = Math.sign(a1 - a2);
  if (predOutcome === actualOutcome) {
    const diffGap = Math.abs(p1 - p2 - (a1 - a2));
    return (diffGap <= 1 ? 8 : 5) * multiplier;
  }
  return 0;
}

function buildLeaderboard(
  resultRows,
  predictionRows,
  userRows,
  fixtureRows = [],
) {
  const displayNames = {};
  for (const user of userRows) {
    const username = String(user.username || user.id || "").trim();
    if (username) displayNames[username] = user.displayName || username;
  }

  const fixtureMap = {};
  for (const f of fixtureRows) {
    const id = String(f.matchId || f.id || "").replace(/^match_/, "");
    if (id) fixtureMap[id] = f;
  }

  const results = {};
  for (const r of resultRows) {
    const matchId = String(r.matchId || r.id || "").replace(/^match_/, "");
    const status = String(r.status || "").toUpperCase();
    const score1 = toNullableNumber(r.score1);
    const score2 = toNullableNumber(r.score2);
    if (!matchId || score1 === null || score2 === null) continue;
    if (!FINAL_STATUSES.includes(status)) continue;
    results[matchId] = { matchId, score1, score2, status };
  }

  const userMap = {};
  for (const prediction of predictionRows) {
    const username = String(prediction.username || "").trim();
    const matchId = String(prediction.matchId || "").replace(/^match_/, "");
    const pred1 = toNullableNumber(prediction.pred1);
    const pred2 = toNullableNumber(prediction.pred2);
    if (!username || !matchId || pred1 === null || pred2 === null) continue;

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
    if (!result) continue;

    const fixture = fixtureMap[matchId] || {};
    const points = scoreMatch(
      pred1,
      pred2,
      result.score1,
      result.score2,
      fixture.stage,
    );
    userMap[username].totalPoints += points;
    userMap[username].scored++;
    if (pred1 === result.score1 && pred2 === result.score2)
      userMap[username].exactScores++;
    if (points > 0) userMap[username].correctOutcomes++;
  }

  // Sort by points (desc), then exactScores, then correctOutcomes (desc)
  const sorted = Object.values(userMap).sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
    if (b.correctOutcomes !== a.correctOutcomes)
      return b.correctOutcomes - a.correctOutcomes;
    return a.username.localeCompare(b.username);
  });

  // ── Competition ranking: ties based on totalPoints, exactScores, and correctOutcomes ──
  const ranked = [];
  let rank = 1;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    // Group all players with the same totalPoints, exactScores, and correctOutcomes
    while (
      j < sorted.length &&
      sorted[j].totalPoints === sorted[i].totalPoints &&
      sorted[j].exactScores === sorted[i].exactScores &&
      sorted[j].correctOutcomes === sorted[i].correctOutcomes
    ) {
      j++;
    }
    const currentRank = rank;
    for (let k = i; k < j; k++) {
      ranked.push({
        ...sorted[k],
        rank: currentRank,
        scored: sorted[k].scored,
      });
    }
    rank += j - i; // skip number of tied players
    i = j;
  }

  return {
    leaderboard: ranked,
    scoredMatches: Object.keys(results).length,
  };
}

// ─── Live Score Fetching & Syncing ──────────────────────────────────────────

async function syncLiveResults(env) {
  const [fixtureRows, apiMatches] = await Promise.all([
    loadCollection(env, "fixtures"),
    fetchPrimaryOrBackupMatches(env),
  ]);

  const fixtureLookups = buildFixtureLookups(fixtureRows);
  const matchedUpdates = [];
  const fixtureApiUpdates = [];

  for (const item of apiMatches) {
    const resolved = resolveFixtureMatch(item, fixtureLookups);
    if (!resolved) continue;

    const { fixture, flipped } = resolved;
    const internalMatchId = normalizeMatchId(fixture.matchId || fixture.id);
    const apiHome = toNullableNumber(readScore(item, "home"));
    const apiAway = toNullableNumber(readScore(item, "away"));
    const apiGameId = toNullableNumber(item.apiGameId);

    if (apiGameId !== null && !fixture.apiFixtureId) {
      fixtureApiUpdates.push({
        matchId: internalMatchId,
        apiFixtureId: apiGameId,
      });
      fixtureLookups.byApiId.set(String(apiGameId), fixture);
      fixture.apiFixtureId = apiGameId;
    }

    matchedUpdates.push({
      matchId: internalMatchId,
      score1: flipped ? apiAway : apiHome,
      score2: flipped ? apiHome : apiAway,
      status: mapStatus(item.status),
      lastUpdated: new Date().toISOString(),
      homeScorers: flipped ? item.awayScorers : item.homeScorers,
      awayScorers: flipped ? item.homeScorers : item.awayScorers,
    });
  }

  if (fixtureApiUpdates.length) {
    try {
      await supabaseUpsert(env, "fixtures", fixtureApiUpdates);
    } catch (error) {
      console.warn(
        "Supabase fixtures apiFixtureId write failed:",
        error.message,
      );
    }
  }

  const liveOrFinished = matchedUpdates.filter(
    (u) => u.status !== "NS" && u.score1 !== null && u.score2 !== null,
  );

  if (liveOrFinished.length) {
    try {
      await supabaseUpsert(env, "results", liveOrFinished);
    } catch (error) {
      console.warn("Supabase results write failed:", error.message);
    }

    try {
      const firestoreUpdates = liveOrFinished.map((u) => ({
        ...u,
        _docId: `match_${u.matchId}`,
      }));
      await firestoreBatchWrite(env, "results", firestoreUpdates);
    } catch (error) {
      console.warn("Firestore results write failed:", error.message);
    }
  }

  const leaderboardData = await recalculateLeaderboard(env);
  console.log(
    JSON.stringify({
      apiMatches: apiMatches.length,
      fixtures: fixtureRows.length,
      matched: matchedUpdates.length,
      written: liveOrFinished.length,
      apiFixtureIdsUpdated: fixtureApiUpdates.length,
      sample: liveOrFinished.slice(0, 5),
    }),
  );
  return {
    success: true,
    matched: matchedUpdates.length,
    updated: liveOrFinished.length,
    apiFixtureIdsUpdated: fixtureApiUpdates.length,
    leaderboard: leaderboardData.leaderboard,
  };
}

async function recalculateLeaderboard(env) {
  const [resultRows, predictionRows, userRows, fixtureRows] = await Promise.all(
    [
      loadCollection(env, "results"),
      loadCollection(env, "predictions"),
      loadCollection(env, "users"),
      loadCollection(env, "fixtures"),
    ],
  );

  const data = buildLeaderboard(
    resultRows,
    predictionRows,
    userRows,
    fixtureRows,
  );

  // Persist leaderboard to Supabase
  if (data.leaderboard.length) {
    try {
      const rows = data.leaderboard.map((p) => ({
        ...p,
        updatedAt: new Date().toISOString(),
      }));
      await supabaseUpsert(env, "leaderboard", rows);
    } catch (error) {
      console.warn("Supabase leaderboard write failed:", error.message);
    }
  }

  return data;
}

async function syncGroupStandings(env) {
  const startedAt = Date.now();
  const [groupsPayload, teamsPayload] = await Promise.all([
    fetchWorldcup26Groups(),
    fetchWorldcup26Teams(),
  ]);

  console.log("worldcup26.ir groups payload", JSON.stringify(groupsPayload));

  const groups = extractArray(groupsPayload, ["groups", "data", "items"]);
  const teamNamesById = buildTeamNameById(teamsPayload);
  const rows = [];
  const warnings = [];

  for (const group of groups) {
    const groupName = String(group.name || group.group || "").trim();
    const teams = extractArray(group, ["teams", "table", "standings"]);
    if (!groupName) {
      warnings.push("Skipped group with no name.");
      continue;
    }
    if (teams.length !== 4) {
      warnings.push(`Group ${groupName} has ${teams.length} teams.`);
    }

    const seenTeamIds = new Set();
    const seenPositions = new Set();

    teams.forEach((team, index) => {
      const teamId = String(
        readFirst(team, ["team_id", "teamId", "id", "_id"]) || "",
      ).trim();
      if (!teamId) {
        warnings.push(`Group ${groupName} has a team row without team_id.`);
        return;
      }

      const position = toRequiredNumber(
        readFirst(team, ["position", "rank", "standing", "pos"]),
        index + 1,
      );
      if (position < 1 || position > 4) {
        warnings.push(
          `Group ${groupName} team ${teamId} has position ${position}.`,
        );
      }
      if (seenTeamIds.has(teamId)) {
        warnings.push(`Group ${groupName} has duplicate team_id ${teamId}.`);
      }
      if (seenPositions.has(position)) {
        warnings.push(`Group ${groupName} has duplicate position ${position}.`);
      }
      seenTeamIds.add(teamId);
      seenPositions.add(position);

      const goalsFor = toRequiredNumber(
        readFirst(team, ["gf", "goals_for"]),
        0,
      );
      const goalsAgainst = toRequiredNumber(
        readFirst(team, ["ga", "goals_against"]),
        0,
      );
      const teamName =
        readFirst(team, ["team_name", "teamName", "name"]) ||
        teamNamesById.get(teamId) ||
        `Team ${teamId}`;
      if (
        !teamNamesById.has(teamId) &&
        !readFirst(team, ["team_name", "teamName", "name"])
      ) {
        warnings.push(`No team name found for team_id ${teamId}.`);
      }

      rows.push({
        group_name: groupName,
        team_id: teamId,
        team_name: String(teamName),
        position,
        played: toRequiredNumber(readFirst(team, ["mp", "played", "p"]), 0),
        won: toRequiredNumber(readFirst(team, ["w", "won"]), 0),
        drawn: toRequiredNumber(readFirst(team, ["d", "drawn", "draws"]), 0),
        lost: toRequiredNumber(readFirst(team, ["l", "lost"]), 0),
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        goal_difference: goalsFor - goalsAgainst,
        points: toRequiredNumber(readFirst(team, ["pts", "points"]), 0),
        updated_at: new Date().toISOString(),
      });
    });
  }

  let updated = 0;
  if (rows.length) {
    updated = await supabaseUpsert(env, "group_standings", rows);
  }

  for (const warning of warnings) console.warn(`standings sync: ${warning}`);

  return {
    success: true,
    groups: groups.length,
    teams: rows.length,
    updated,
    executionMs: Date.now() - startedAt,
    warnings,
  };
}

async function handleRivalryGet(env, username) {
  const [allPredictions, allResults, allUsers] = await Promise.all([
    loadCollection(env, "predictions"),
    loadCollection(env, "results"),
    loadCollection(env, "users"),
  ]);

  // Only score finished matches
  const FINAL_STS = ["FT", "AET", "PEN", "COMPLETED", "FINAL"];
  const finishedMatchIds = new Set(
    allResults
      .filter((r) => FINAL_STS.includes(String(r.status || "").toUpperCase()))
      .map((r) => String(r.matchId || r.id || "").replace(/^match_/, "")),
  );

  // Index this user's predictions on finished matches
  const myPreds = {};
  allPredictions
    .filter(
      (p) => String(p.username || "").toLowerCase() === username.toLowerCase(),
    )
    .forEach((p) => {
      const mid = String(p.matchId || "").replace(/^match_/, "");
      if (finishedMatchIds.has(mid)) {
        myPreds[mid] = {
          pred1: toNullableNumber(p.pred1),
          pred2: toNullableNumber(p.pred2),
        };
      }
    });

  if (!Object.keys(myPreds).length) {
    return { rival: null, reason: "not_enough_data" };
  }

  // For each other user, compute divergence score on shared finished matches
  // Also track agreement score (opposite of divergence)
  const userScores = {};

  allPredictions
    .filter((p) => {
      const u = String(p.username || "").toLowerCase();
      return u !== username.toLowerCase() && u !== "";
    })
    .forEach((p) => {
      const mid = String(p.matchId || "").replace(/^match_/, "");
      const mine = myPreds[mid];
      if (!mine || mine.pred1 === null || mine.pred2 === null) return;

      const theirP1 = toNullableNumber(p.pred1);
      const theirP2 = toNullableNumber(p.pred2);
      if (theirP1 === null || theirP2 === null) return;

      const u = String(p.username || "").toLowerCase();
      if (!userScores[u])
        userScores[u] = { username: u, divergence: 0, shared: 0, agreement: 0 };

      const diff =
        Math.abs(mine.pred1 - theirP1) + Math.abs(mine.pred2 - theirP2);
      userScores[u].divergence += diff;
      userScores[u].shared += 1;
      // 0 diff = perfect agreement
      if (diff === 0) userScores[u].agreement += 1;
    });

  const candidates = Object.values(userScores).filter((u) => u.shared >= 3);
  if (!candidates.length) return { rival: null, reason: "not_enough_data" };

  // Rival = highest avg divergence per shared match
  candidates.sort((a, b) => b.divergence / b.shared - a.divergence / a.shared);
  const rivalEntry = candidates[0];

  // Twin = highest agreement rate
  candidates.sort((a, b) => b.agreement / b.shared - a.agreement / a.shared);
  const twinEntry = candidates[0];

  // Resolve display names
  const nameMap = {};
  allUsers.forEach((u) => {
    nameMap[String(u.username || "").toLowerCase()] =
      u.displayName || u.username;
  });

  return {
    rival: {
      username: rivalEntry.username,
      displayName: nameMap[rivalEntry.username] || rivalEntry.username,
      divergenceScore:
        Math.round((rivalEntry.divergence / rivalEntry.shared) * 10) / 10,
      sharedMatches: rivalEntry.shared,
    },
    twin:
      twinEntry.agreement / twinEntry.shared > 0.2
        ? {
          username: twinEntry.username,
          displayName: nameMap[twinEntry.username] || twinEntry.username,
          agreementPct: Math.round(
            (twinEntry.agreement / twinEntry.shared) * 100,
          ),
          sharedMatches: twinEntry.shared,
        }
        : null,
  };
}
async function handleProfileGet(env, username) {
  const [allUsers, allPredictions, allFixtures, allResults, leaderboardData] =
    await Promise.all([
      loadCollection(env, "users"),
      loadCollection(env, "predictions"),
      loadCollection(env, "fixtures"),
      loadCollection(env, "results"),
      recalculateLeaderboard(env),
    ]);

  const user = allUsers.find(
    (u) =>
      String(u.username || u.id || "")
        .trim()
        .toLowerCase() === username.toLowerCase(),
  );
  if (!user) {
    return { success: false, error: "User not found" };
  }

  const lbEntry =
    leaderboardData.leaderboard.find(
      (e) => String(e.username || "").toLowerCase() === username.toLowerCase(),
    ) || {};

  // Index fixtures and results by matchId
  const fixtureMap = {};
  for (const f of allFixtures) {
    const id = String(f.matchId || f.id || "").replace(/^match_/, "");
    if (id) fixtureMap[id] = f;
  }
  const resultMap = {};
  for (const r of allResults) {
    const id = String(r.matchId || r.id || "").replace(/^match_/, "");
    if (id) resultMap[id] = r;
  }

  const userPredictions = allPredictions.filter(
    (p) => String(p.username || "").toLowerCase() === username.toLowerCase(),
  );

  const FINAL_STS = ["FT", "AET", "PEN", "COMPLETED", "FINAL"];
  const LIVE_STS = ["1H", "HT", "2H", "ET", "P", "LIVE"];

  const predictions = userPredictions
    .filter((p) => p.matchId != null)
    .map((p) => {
      const matchId = String(p.matchId).replace(/^match_/, "");
      const fixture = fixtureMap[matchId] || {};
      const result = resultMap[matchId];

      const pred1 = toNullableNumber(p.pred1);
      const pred2 = toNullableNumber(p.pred2);
      const hasPred = pred1 !== null && pred2 !== null;

      let actualHome = null,
        actualAway = null,
        points = null,
        statusType = "upcoming";

      if (result) {
        actualHome = toNullableNumber(
          result.score1 ?? result.homeScore ?? result.team1Score,
        );
        actualAway = toNullableNumber(
          result.score2 ?? result.awayScore ?? result.team2Score,
        );
        const st = String(result.status || "NS").toUpperCase();
        if (FINAL_STS.includes(st)) statusType = "finished";
        else if (LIVE_STS.includes(st)) statusType = "live";
      }

      if (hasPred && actualHome !== null && actualAway !== null) {
        points = scoreMatch(
          pred1,
          pred2,
          actualHome,
          actualAway,
          fixture.stage,
        );
      }

      return {
        matchId,
        home: fixture.team1 || "TBD",
        away: fixture.team2 || "TBD",
        group: fixture.group || "",
        round: fixture.round || "",
        date: fixture.date || "",
        time: fixture.time || "",
        predictedHome: hasPred ? pred1 : null,
        predictedAway: hasPred ? pred2 : null,
        actualHome,
        actualAway,
        points,
        status: String(result?.status || "NS").toUpperCase(),
        statusType,
      };
    })
    .sort((a, b) => {
      const order = { finished: 0, live: 1, upcoming: 2 };
      const od = (order[a.statusType] ?? 3) - (order[b.statusType] ?? 3);
      return od !== 0 ? od : Number(a.matchId) - Number(b.matchId);
    });

  return {
    user: {
      username: user.username || username,
      displayName: user.displayName || username,
      isAdmin: Boolean(user.isAdmin),
      totalPoints: lbEntry.totalPoints ?? 0,
      exactScores: lbEntry.exactScores ?? 0,
      correctOutcomes: lbEntry.correctOutcomes ?? 0,
      predicted: userPredictions.length,
      rank: lbEntry.rank ?? null,
    },
    predictions,
  };
}
// ─── Main GET /sync endpoint ────────────────────────────────────────────────

async function handleSyncGet(env) {
  const [fixtureRows, resultRows, userRows, predictionRows, groupStandingRows] =
    await Promise.all([
      loadCollection(env, "fixtures"),
      loadCollection(env, "results"),
      loadCollection(env, "users"),
      loadCollection(env, "predictions"),
      loadCollection(env, "group_standings"),
    ]);

  const fixtures = fixtureRows.map((f) => ({
    matchId: String(f.matchId || f.id || "").replace(/^match_/, ""),
    round: f.round || "",
    group: f.group || "",
    date: f.date || "",
    time: f.time || "",
    kickoffUTC: f.kickoffUTC || null,
    team1: f.team1 || "",
    team2: f.team2 || "",
    ground: f.ground || "",
    stage: f.stage || "",
  }));

  const results = {};
  for (const r of resultRows) {
    const matchId = String(r.matchId || r.id || "").replace(/^match_/, "");
    if (!matchId) continue;
    results[matchId] = {
      matchId,
      score1: toNullableNumber(r.score1),
      score2: toNullableNumber(r.score2),
      status: String(r.status || "NS").toUpperCase(),
      homeScorers: r.homeScorers || [],
      awayScorers: r.awayScorers || [],
    };
  }

  const users = userRows
    .map((u) => ({
      username: String(u.username || u.id || "").trim(),
      displayName: u.displayName || u.username || u.id || "",
      isAdmin: Boolean(u.isAdmin),
    }))
    .filter((u) => u.username);

  const { leaderboard } = buildLeaderboard(
    resultRows,
    predictionRows,
    userRows,
  );

  return {
    fixtures,
    results,
    users,
    leaderboard,
    groupStandings: formatGroupStandings(groupStandingRows),
    timestamp: new Date().toISOString(),
  };
}
// --- Helper: Send email via Mailjet v3.1 ---
// --- Helper: Send email via Mailjet v3.1 ---
async function sendMailjetEmail(env, { to, subject, html, text }) {
  const publicKey = env.MJ_APIKEY_PUBLIC;
  const privateKey = env.MJ_APIKEY_PRIVATE;

  // Validate keys are present
  if (!publicKey || !privateKey) {
    throw new Error('Mailjet API keys are not set in environment variables');
  }

  const payload = {
    Messages: [{
      From: {
        Email: 'noreply@your-verified-domain.com', // Replace with your verified sender
        Name: 'GGO Predictor',
      },
      To: [{ Email: to }],
      Subject: subject,
      TextPart: text || html.replace(/<[^>]+>/g, ''), // fallback plain text
      HTMLPart: html,
    }],
  };

  const resp = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${publicKey}:${privateKey}`)}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Mailjet error: ${JSON.stringify(data)}`);
  }
  return data;
}
// ─── Endpoint Router ────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const action = url.searchParams.get("action");

    try {
      // /sync-scores — trigger live score fetch + recalc
      if (path === "/sync-scores" || action === "sync-scores") {
        if (!isAuthorized(request, env)) {
          return corsJson({ success: false, error: "Unauthorized" }, 401);
        }
        const result = await syncLiveResults(env);
        return corsJson({ ...result, mode: "manual-sync-scores" });
      }

      // /admin/sync-standings - fetch official group tables into Supabase
      if (path === "/admin/sync-standings" || action === "sync-standings") {
        if (!isAuthorized(request, env)) {
          return corsJson({ success: false, error: "Unauthorized" }, 401);
        }
        const result = await syncGroupStandings(env);
        return corsJson({ ...result, mode: "manual-sync-standings" });
      }

      // /seed — alias for sync-scores (backwards compat)
      if (path === "/seed" || action === "seed") {
        if (!isAuthorized(request, env)) {
          return corsJson({ success: false, error: "Unauthorized" }, 401);
        }
        const result = await syncLiveResults(env);
        return corsJson({ ...result, mode: "manual-seed" });
      }

      // /sync — returns all data (public, read-only)
      if (path === "/sync" || action === "sync") {
        const data = await handleSyncGet(env);
        return corsJson(data);
      }

      // /fixtures — just fixtures
      if (path === "/fixtures" || action === "fixtures") {
        const fixtureRows = await loadCollection(env, "fixtures");
        const fixtures = fixtureRows.map((f) => ({
          matchId: String(f.matchId || f.id || "").replace(/^match_/, ""),
          round: f.round || "",
          group: f.group || "",
          date: f.date || "",
          time: f.time || "",
          kickoffUTC: f.kickoffUTC || null,
          team1: f.team1 || "",
          team2: f.team2 || "",
          ground: f.ground || "",
          stage: f.stage || "",
        }));
        return corsJson({ fixtures, timestamp: new Date().toISOString() });
      }

      // /leaderboard — just the leaderboard
      if (path === "/leaderboard" || action === "leaderboard") {
        const data = await recalculateLeaderboard(env);
        return corsJson({
          leaderboard: data.leaderboard,
          scoredMatches: data.scoredMatches,
          timestamp: new Date().toISOString(),
        });
      }
      // /rivalry — find the user whose predictions diverge most from this user's
      if (path === "/rivalry" || action === "rivalry") {
        const username = url.searchParams.get("username") || "";
        if (!username) return corsJson({ error: "username required" }, 400);
        const data = await handleRivalryGet(env, username);
        return corsJson(data);
      }

      // /profile — single-user profile data
      if (path === "/profile" || action === "profile") {
        const username = url.searchParams.get("username") || "";
        if (!username) {
          return corsJson(
            { success: false, error: "username param required" },
            400,
          );
        }
        const profileData = await handleProfileGet(env, username);
        return corsJson(profileData);
      }

      // POST /admin/approve-request — create user in Supabase + send approval email
      // POST /admin/approve-request
      if (
        (path === "/admin/approve-request" || action === "approve-request") &&
        request.method === "POST"
      ) {
        if (!isAuthorized(request, env)) {
          return corsJson({ success: false, error: "Unauthorized" }, 401);
        }
        const body = await request.json();
        const { username, displayName, email, secretCode } = body;
        if (!username || !email || !secretCode) {
          return corsJson(
            { success: false, error: "username, email, secretCode required" },
            400,
          );
        }
        // Persist user
        await supabaseUpsert(env, "users", [
          {
            username,
            displayName: displayName || username,
            secretCode,
            isAdmin: false,
            joinedAt: new Date().toISOString(),
          },
        ]);
        await supabaseUpsert(env, "accountRequests", [
          {
            username,
            status: "approved",
            approvedAt: new Date().toISOString(),
            secretCode,
          },
        ]);

        // Send approval email to the user
        const subject = 'Your GGO WC 2026 Predictor Account is Approved!';
        const html = `
    <p>Hi ${displayName || username},</p>
    <p>Your account request has been <strong>approved</strong>.</p>
    <p>Your login details:</p>
    <ul>
      <li><strong>Username:</strong> ${username}</li>
      <li><strong>Secret Code:</strong> ${secretCode}</li>
    </ul>
    <p><a href="https://your-app.com">Log in here</a></p>
    <p>Good luck with your predictions! 🏆</p>
  `;
        try {
          await sendMailjetEmail(env, { to: email, subject, html });
        } catch (e) {
          console.error('Approval email failed (non-critical):', e.message);
          // Don't fail the request if email fails
        }

        return corsJson({ success: true, username });
      }
      // POST /admin/reject-request
      if (
        (path === "/admin/reject-request" || action === "reject-request") &&
        request.method === "POST"
      ) {
        if (!isAuthorized(request, env)) {
          return corsJson({ success: false, error: "Unauthorized" }, 401);
        }
        const body = await request.json();
        const { username, displayName, email } = body;
        if (!username || !email) {
          return corsJson(
            { success: false, error: "username and email required" },
            400,
          );
        }
        await supabaseUpsert(env, "accountRequests", [
          {
            username,
            status: "rejected",
            rejectedAt: new Date().toISOString(),
          },
        ]);

        // Send rejection email to the user
        const subject = 'Your GGO WC 2026 Predictor Account Request';
        const html = `
    <p>Hi ${displayName || username},</p>
    <p>We’re sorry, but your account request has been <strong>rejected</strong>.</p>
    <p>If you think this is a mistake, please contact the admin team.</p>
  `;
        try {
          await sendMailjetEmail(env, { to: email, subject, html });
        } catch (e) {
          console.error('Rejection email failed (non-critical):', e.message);
        }

        return corsJson({ success: true, username });
      }
      // POST /admin/new-request — notify admin when a new request is submitted
      if (path === '/admin/new-request' && request.method === 'POST') {
        const body = await request.json();
        const { username, displayName, email, note } = body;
        if (!username || !email) {
          return corsJson({ success: false, error: "username and email required" }, 400);
        }

        const adminEmail = 'admin@gulfglobaloutsourcing.com'; // Change to your admin email

        const subject = `New Account Request: ${displayName || username} (@${username})`;
        const html = `
    <p><strong>${displayName || username}</strong> (${email}) has requested an account.</p>
    <p>Username: @${username}</p>
    ${note ? `<p>Note: ${note}</p>` : ''}
    <p><a href="https://your-app.com/admin">Go to Admin Panel</a> to approve or reject.</p>
  `;

        try {
          await sendMailjetEmail(env, { to: adminEmail, subject, html });
          return corsJson({ success: true });
        } catch (err) {
          console.error('Admin notification email failed:', err.message);
          return corsJson({ success: false, error: err.message }, 500);
        }
      }
      // Serve frontend assets
      if (
        !path.startsWith("/sync") &&
        !path.startsWith("/admin") &&
        !path.startsWith("/fixtures") &&
        !path.startsWith("/leaderboard") &&
        !path.startsWith("/rivalry") &&
        !path.startsWith("/profile")
      ) {
        return env.ASSETS.fetch(request);
      }
      // Root — API info
      return corsJson({
        ok: true,
        routes: [
          "/sync",
          "/sync-scores",
          "/admin/sync-standings",
          "/admin/approve-request",
          "/admin/reject-request",
          "/fixtures",
          "/leaderboard",
        ],
        message:
          "GGO WC 2026 Predictor API. Use /sync for all data, /sync-scores for scores, and /admin/sync-standings for official group tables.",
      });
    } catch (error) {
      console.error("Worker error:", error);
      return corsJson({ success: false, error: error.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    if (event.cron === "*/15 * * * *") {
      ctx.waitUntil(syncGroupStandings(env));
      return;
    }
    ctx.waitUntil(syncLiveResults(env));
  },
};

// ─── Auth ───────────────────────────────────────────────────────────────────

function isAuthorized(request, env) {
  const token = env.SEED_TOKEN;
  if (!token) return false;
  const header = request.headers.get("Authorization") || "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  return header === `Bearer ${token}` || queryToken === token;
}

// ─── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(response) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function corsJson(data, status = 200) {
  const response = new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  return corsResponse(response);
}

// ─── Live Match Fetching (same as before, cleaned up) ───────────────────────

async function fetchPrimaryOrBackupMatches(env) {
  const zafronixKey = env.ZAFRONIX_API_KEY;
  const livescoreApiKey = env.LIVESCORE_API_KEY;
  const livescoreApiSecret = env.LIVESCORE_API_SECRET;

  try {
    return await fetchWorldcup26Matches();
  } catch (error) {
    console.warn("worldcup26.ir failed:", error.message);
  }

  try {
    if (zafronixKey) return await fetchZafronixMatches(zafronixKey);
  } catch (error) {
    console.warn("Zafronix failed:", error.message);
  }

  if (!livescoreApiKey || !livescoreApiSecret) {
    console.warn("Livescore API missing — skipping fallback.");
    return [];
  }
  return fetchLivescoreMatches(livescoreApiKey, livescoreApiSecret);
}

async function fetchWorldcup26Matches(retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(WORLDCUP26_GAMES_URL, {
        headers: { Accept: "application/json" },
      });

      // If the response is not 2xx
      if (!response.ok) {
        // Retry only if it's a server error (5xx) and we have attempts left
        if (response.status >= 500 && attempt < retries) {
          console.warn(
            `Server error ${response.status}. Retrying attempt ${attempt}...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue; // Skip to the next loop iteration
        }

        // Throw immediately for 4xx errors (client errors shouldn't be retried)
        throw new Error(`worldcup26.ir HTTP ${response.status}`);
      }

      const data = await response.json();
      return normalizeWorldcup26Games(data);
    } catch (error) {
      // If it's a network/connection error and we have attempts left, retry
      if (attempt < retries) {
        console.warn(`Network error. Retrying attempt ${attempt}...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Out of retries, bubble the error up
        throw error;
      }
    }
  }
}

async function fetchWorldcup26Groups() {
  const response = await fetch(WORLDCUP26_GROUPS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`worldcup26.ir groups HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchWorldcup26Teams() {
  const response = await fetch(WORLDCUP26_TEAMS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    console.warn(`worldcup26.ir teams HTTP ${response.status}`);
    return {};
  }
  return response.json();
}

async function fetchZafronixMatches(apiKey) {
  const response = await fetch(ZAFRONIX_URL, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Zafronix HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : data.matches || [];
}

async function fetchLivescoreMatches(apiKey, apiSecret) {
  const [fixturesResponse, liveResponse] = await Promise.all([
    fetch(
      `${LIVESCORE_FIXTURES_URL}&key=${encodeURIComponent(apiKey)}&secret=${encodeURIComponent(apiSecret)}`,
    ),
    fetch(
      `${LIVESCORE_LIVE_URL}&key=${encodeURIComponent(apiKey)}&secret=${encodeURIComponent(apiSecret)}`,
    ),
  ]);
  if (!fixturesResponse.ok)
    throw new Error(`Livescore fixtures HTTP ${fixturesResponse.status}`);
  if (!liveResponse.ok)
    throw new Error(`Livescore live HTTP ${liveResponse.status}`);

  const fixturesData = await fixturesResponse.json();
  const liveData = await liveResponse.json();
  const fixtures = extractLivescoreArray(fixturesData);
  const live = extractLivescoreArray(liveData);

  const liveMap = new Map();
  for (const item of live) {
    const key = buildLivescoreKey(item);
    if (key) liveMap.set(key, item);
  }

  return fixtures.map((item) => {
    const key = buildLivescoreKey(item);
    const liveItem = key ? liveMap.get(key) : null;
    return liveItem ? mergeLivescoreFixtureAndLive(item, liveItem) : item;
  });
}

// ─── Normalizers & Utilities ────────────────────────────────────────────────

function normalizeMatchId(value) {
  return String(value || "").replace(/^match_/, "");
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
  if (clean === "cotedivoire" || clean === "ivorycoast") return "ivorycoast";
  if (clean === "curaao" || clean === "curacao") return "curacao";
  if (
    clean === "drcongo" ||
    clean === "congodr" ||
    clean === "democraticrepublicofcongo" ||
    clean === "democraticrepublicofthecongo" ||
    clean === "congodemocraticrepublic"
  )
    return "drcongo";
  if (clean === "capeverde" || clean === "caboverde") return "capeverde";
  return clean;
}

function buildFixtureLookups(fixtureRows) {
  const byApiId = new Map();
  const byTeams = new Map();

  for (const fixture of fixtureRows) {
    const matchId = normalizeMatchId(fixture.matchId || fixture.id);
    if (!matchId) continue;

    if (fixture.apiFixtureId !== null && fixture.apiFixtureId !== undefined) {
      byApiId.set(String(fixture.apiFixtureId), fixture);
    }

    const home = cleanTeamName(fixture.team1);
    const away = cleanTeamName(fixture.team2);
    if (home && away) {
      byTeams.set(`${home}__${away}`, { fixture, flipped: false });
      byTeams.set(`${away}__${home}`, { fixture, flipped: true });
    }
  }

  return { byApiId, byTeams };
}

function resolveFixtureMatch(item, lookups) {
  const apiGameId = item.apiGameId ?? item.matchId ?? null;
  const homeTeam = cleanTeamName(item.homeTeam || item.team1 || "");
  const awayTeam = cleanTeamName(item.awayTeam || item.team2 || "");
  if (!homeTeam || !awayTeam) return null;

  if (apiGameId !== null && apiGameId !== undefined && apiGameId !== "") {
    const byId = lookups.byApiId.get(String(apiGameId));
    if (byId) {
      const dbHome = cleanTeamName(byId.team1);
      const dbAway = cleanTeamName(byId.team2);
      const flipped = dbHome === awayTeam && dbAway === homeTeam;
      return { fixture: byId, flipped };
    }
  }

  const teamMatch = lookups.byTeams.get(`${homeTeam}__${awayTeam}`);
  if (teamMatch) return teamMatch;

  return null;
}

function mapStatus(zStatus) {
  if (!zStatus) return "NS";
  const s = String(zStatus).toLowerCase();
  if (["completed", "finished", "ft", "full-time", "fulltime"].includes(s))
    return "FT";
  if (["halftime", "ht", "half-time"].includes(s)) return "HT";
  if (["live", "in_play", "inplay", "1h", "first half"].includes(s))
    return "1H";
  if (["second half", "2h"].includes(s)) return "2H";
  if (["aet", "extra time", "extra-time"].includes(s)) return "AET";
  if (["pen", "penalties", "pens"].includes(s)) return "PEN";
  return "NS";
}

function readScore(item, side) {
  const keys =
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
  for (const key of keys) {
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

function extractLivescoreArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  return (
    payload.data ||
    payload.matches ||
    payload.fixtures ||
    payload.results ||
    payload.items ||
    []
  );
}

function extractArray(payload, keys) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function readFirst(item, keys) {
  if (!item || typeof item !== "object") return undefined;
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
      return item[key];
    }
  }
  return undefined;
}

function toRequiredNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function buildTeamNameById(payload) {
  const teams = extractArray(payload, ["teams", "data", "items"]);
  const byId = new Map();
  for (const team of teams) {
    const id = String(
      readFirst(team, ["team_id", "teamId", "id", "_id"]) || "",
    ).trim();
    const name = readFirst(team, [
      "name",
      "team_name",
      "teamName",
      "name_en",
      "country",
    ]);
    if (id && name) byId.set(id, String(name));
  }
  return byId;
}

function formatGroupStandings(rows) {
  const groups = {};
  for (const row of rows || []) {
    const groupName = String(row.group_name || row.group || "").trim();
    if (!groupName) continue;
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push({
      group_name: groupName,
      team_id: String(row.team_id || ""),
      team_name: row.team_name || row.teamName || row.name || "",
      position: toRequiredNumber(row.position, 0),
      played: toRequiredNumber(row.played, 0),
      won: toRequiredNumber(row.won, 0),
      drawn: toRequiredNumber(row.drawn, 0),
      lost: toRequiredNumber(row.lost, 0),
      goals_for: toRequiredNumber(row.goals_for, 0),
      goals_against: toRequiredNumber(row.goals_against, 0),
      goal_difference: toRequiredNumber(row.goal_difference, 0),
      points: toRequiredNumber(row.points, 0),
      updated_at: row.updated_at || null,
    });
  }

  Object.keys(groups).forEach((groupName) => {
    groups[groupName].sort(
      (a, b) =>
        a.position - b.position ||
        String(a.team_name).localeCompare(String(b.team_name)),
    );
  });

  return Object.fromEntries(
    Object.entries(groups).sort(([a], [b]) =>
      String(a).localeCompare(String(b)),
    ),
  );
}

function buildLivescoreKey(item) {
  const home = cleanTeamName(
    item.home_name ||
    item.home ||
    item.team1 ||
    item.localteam_name ||
    item.localteam ||
    "",
  );
  const away = cleanTeamName(
    item.away_name ||
    item.away ||
    item.team2 ||
    item.visitorteam_name ||
    item.visitorteam ||
    "",
  );
  if (!home || !away) return "";
  return `${home}__${away}`;
}

function mergeLivescoreFixtureAndLive(fixtureItem, liveItem) {
  return {
    ...fixtureItem,
    ...liveItem,
    homeTeam:
      fixtureItem.homeTeam ||
      fixtureItem.team1 ||
      liveItem.homeTeam ||
      liveItem.home ||
      liveItem.home_name ||
      liveItem.localteam_name ||
      liveItem.localteam ||
      "",
    awayTeam:
      fixtureItem.awayTeam ||
      fixtureItem.team2 ||
      liveItem.awayTeam ||
      liveItem.away ||
      liveItem.away_name ||
      liveItem.visitorteam_name ||
      liveItem.visitorteam ||
      "",
    status: liveItem.status || fixtureItem.status,
  };
}

function normalizeWorldcup26Games(payload) {
  const games = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.games)
      ? payload.games
      : [];
  return games.map((game) => ({
    source: "worldcup26",
    apiGameId: String(game.id || game.matchId || ""),
    homeTeam:
      game.home_team_name_en || game.home_team_label || game.home_team || "",
    awayTeam:
      game.away_team_name_en || game.away_team_label || game.away_team || "",
    homeScore: readGameScore(game, "home"),
    awayScore: readGameScore(game, "away"),
    status: mapWorldcup26Status(game),
    timeElapsed: game.time_elapsed || "",
    finished: game.finished,
    localDate: game.local_date || "",
    homeScorers: parseScorers(game.home_scorers),
    awayScorers: parseScorers(game.away_scorers),
  }));
}

function readGameScore(game, side) {
  return side === "home"
    ? (game.home_score ?? game.score1 ?? game.homeScore ?? null)
    : (game.away_score ?? game.score2 ?? game.awayScore ?? null);
}

function mapWorldcup26Status(game) {
  if (String(game.finished).toLowerCase() === "true") return "FT";
  const elapsed = String(game.time_elapsed || "").toLowerCase();
  if (elapsed && elapsed !== "notstarted") return "LIVE";
  return "NS";
}
function parseScorers(raw) {
  if (!raw || raw === "null") return [];
  const cleaned = String(raw)
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .split(/",\s*"/)
    .map((s) => s.replace(/^"+|"+$/g, "").trim())
    .filter(Boolean);
  return cleaned;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseJsonSecret(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ─── Firebase Auth (JWT / service account) ──────────────────────────────────

let cachedTokenPromise = null;
let tokenExpiryTime = 0;

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedTokenPromise && tokenExpiryTime > now + 60) {
    return cachedTokenPromise;
  }

  tokenExpiryTime = now + 3600; // Optimistic, will be adjusted on success
  cachedTokenPromise = (async () => {
    try {
      const header = { alg: "RS256", typ: "JWT" };
      const claimSet = {
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      };

      const unsignedJwt = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(claimSet)}`;
      const key = await importPrivateKey(serviceAccount.private_key);
      const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(unsignedJwt),
      );
      const jwt = `${unsignedJwt}.${base64UrlEncodeBuffer(signature)}`;

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
      });

      if (!tokenResponse.ok) {
        const text = await tokenResponse.text();
        throw new Error(`OAuth token failed ${tokenResponse.status}: ${text}`);
      }

      const tokenData = await tokenResponse.json();
      tokenExpiryTime = now + (tokenData.expires_in || 3600);
      return tokenData.access_token;
    } catch (error) {
      cachedTokenPromise = null;
      tokenExpiryTime = 0;
      throw error;
    }
  })();

  return cachedTokenPromise;
}

async function importPrivateKey(pem) {
  if (!pem) {
    throw new Error("Private key is empty or missing.");
  }
  try {
    const cleaned = pem
      .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
      .replace(/\s+/g, "");
    const der = base64ToArrayBuffer(cleaned);
    return await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    throw new Error(`Failed to import private key: ${error.message}`);
  }
}

function base64UrlEncodeJson(value) {
  return base64UrlEncodeString(JSON.stringify(value));
}

function base64UrlEncodeString(value) {
  return base64UrlEncodeBuffer(new TextEncoder().encode(value));
}

function base64UrlEncodeBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
