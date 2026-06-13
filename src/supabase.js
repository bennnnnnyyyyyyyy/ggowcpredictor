// Supabase REST helpers for Apps Script.
// Used as a fallback datastore when Firestore quota blocks reads/writes.

const SUPABASE_DEFAULT_URL = "https://nthnysznieivbkncpqrk.supabase.co";
const SUPABASE_DEFAULT_KEY = "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo";

const SUPABASE_CONFLICT_KEYS = {
  fixtures: "matchId",
  results: "matchId",
  predictions: "id",
  users: "username",
  leaderboard: "username",
};

function supabaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  const rawUrl =
    props.getProperty("SUPABASE_URL") ||
    firebaseConfig.supabaseUrl ||
    SUPABASE_DEFAULT_URL;
  const apiKey =
    props.getProperty("SUPABASE_KEY") ||
    firebaseConfig.supabaseAnonKey ||
    SUPABASE_DEFAULT_KEY;

  return {
    url: String(rawUrl).replace(/\/rest\/v1\/?$/, "").replace(/\/$/, ""),
    apiKey,
  };
}

function supabaseRestUrl_(table, query) {
  const cfg = supabaseConfig_();
  const suffix = query ? `?${query}` : "";
  return `${cfg.url}/rest/v1/${table}${suffix}`;
}

function supabaseHeaders_(extra) {
  const cfg = supabaseConfig_();
  return Object.assign(
    {
      apikey: cfg.apiKey,
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    extra || {},
  );
}

function fetchSupabaseCollection(table, query) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const params = [`select=${encodeURIComponent(query || "*")}`];
    const response = UrlFetchApp.fetch(
      supabaseRestUrl_(table, params.join("&")),
      {
        method: "get",
        headers: supabaseHeaders_({
          Range: `${offset}-${offset + pageSize - 1}`,
        }),
        muteHttpExceptions: true,
      },
    );
    const code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error(
        `Supabase fetch ${table} failed with HTTP ${code}: ${response.getContentText()}`,
      );
    }

    const chunk = JSON.parse(response.getContentText() || "[]");
    rows.push.apply(rows, chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function writeToSupabaseBackup(table, payload) {
  const rows = (Array.isArray(payload) ? payload : [payload])
    .map(function (row) {
      return normalizeSupabaseRow_(table, row);
    })
    .filter(Boolean);

  if (!rows.length) return true;

  const conflictKey = SUPABASE_CONFLICT_KEYS[table];
  const query = conflictKey ? `on_conflict=${encodeURIComponent(conflictKey)}` : "";
  const response = UrlFetchApp.fetch(supabaseRestUrl_(table, query), {
    method: "post",
    contentType: "application/json",
    headers: supabaseHeaders_({
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    payload: JSON.stringify(rows),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(
      `Supabase write ${table} failed with HTTP ${code}: ${response.getContentText()}`,
    );
  }

  return true;
}

function normalizeSupabaseRow_(table, row) {
  if (!row) return null;

  if (table === "users") {
    const username = String(row.username || row.id || "").trim();
    if (!username) return null;
    return {
      username,
      displayName: row.displayName || row.name || username,
      secretCode: row.secretCode || row.code || "",
      isAdmin: Boolean(row.isAdmin),
      totalPoints: numberOrDefault_(row.totalPoints, 0),
      joinedAt: row.joinedAt || row.createdAt || null,
    };
  }

  if (table === "fixtures") {
    const matchId = String(row.matchId || row.id || "").replace(/^match_/, "");
    if (!matchId) return null;
    return {
      matchId,
      round: row.round || "",
      group: row.group || "",
      stage: row.stage || "",
      date: row.date || "",
      time: row.time || "",
      kickoffUTC: row.kickoffUTC || null,
      team1: row.team1 || "",
      team2: row.team2 || "",
      ground: row.ground || "",
      apiFixtureId: nullableNumber_(row.apiFixtureId),
    };
  }

  if (table === "predictions") {
    const username = String(row.username || "").trim();
    const matchId = String(row.matchId || "").replace(/^match_/, "");
    if (!username || !matchId) return null;
    return {
      id: row.id || `${username}_${matchId}`,
      username,
      matchId,
      pred1: nullableNumber_(row.pred1),
      pred2: nullableNumber_(row.pred2),
      submittedAt: row.submittedAt || row.updatedAt || null,
      pointsAwarded: nullableNumber_(row.pointsAwarded),
      scoredAt: row.scoredAt || null,
    };
  }

  if (table === "results") {
    const matchId = String(row.matchId || row.id || "").replace(/^match_/, "");
    if (!matchId) return null;
    return {
      matchId,
      score1: nullableNumber_(row.score1),
      score2: nullableNumber_(row.score2),
      status: String(row.status || "NS").toUpperCase(),
      lastUpdated: row.lastUpdated || row.updatedAt || new Date().toISOString(),
    };
  }

  if (table === "leaderboard") {
    const username = String(row.username || "").trim();
    if (!username) return null;
    return {
      username,
      rank: numberOrDefault_(row.rank, 0),
      displayName: row.displayName || username,
      totalPoints: numberOrDefault_(row.totalPoints, 0),
      exactScores: numberOrDefault_(row.exactScores, 0),
      correctOutcomes: numberOrDefault_(row.correctOutcomes, 0),
      predicted: numberOrDefault_(row.predicted, 0),
      scored: numberOrDefault_(row.scored, 0),
      updatedAt: row.updatedAt || new Date().toISOString(),
    };
  }

  return row;
}

function nullableNumber_(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function numberOrDefault_(value, fallback) {
  const numberValue = nullableNumber_(value);
  return numberValue === null ? fallback : numberValue;
}
