const WORLDCUP26_GAMES_URL = "https://worldcup26.ir/get/games";
const ZAFRONIX_URL =
  "https://api.zafronix.com/fifa/worldcup/v1/tournaments/2026/matches";
const LIVESCORE_FIXTURES_URL =
  "https://livescore-api.com/api-client/fixtures/matches.json?competition_id=362";
const LIVESCORE_LIVE_URL =
  "https://livescore-api.com/api-client/matches/live.json?competition_id=362";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/seed" || url.searchParams.get("action") === "seed") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ success: false, error: "Unauthorized" }, 401);
      }
      try {
        const result = await syncLiveResults(env);
        return jsonResponse({ ...result, mode: "manual-seed" });
      } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
      }
    }

    if (url.pathname === "/sync" || url.searchParams.get("action") === "sync") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ success: false, error: "Unauthorized" }, 401);
      }
      try {
        const result = await syncLiveResults(env);
        return jsonResponse({ ...result, mode: "manual-sync" });
      } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
      }
    }

    return jsonResponse({
      ok: true,
      routes: ["/seed", "/sync"],
      message: "Use /seed once for initial population or /sync for a manual update.",
    });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncLiveResults(env));
  },
};

async function syncLiveResults(env) {
  const projectId = env.FIREBASE_PROJECT_ID || "ggowcpredictor";
  const zafronixKey = env.ZAFRONIX_API_KEY;
  const livescoreApiKey = env.LIVESCORE_API_KEY;
  const livescoreApiSecret = env.LIVESCORE_API_SECRET;
  const serviceAccount = parseJsonSecret(env.FIREBASE_SERVICE_ACCOUNT_JSON);

  if (!zafronixKey) throw new Error("Missing ZAFRONIX_API_KEY.");
  if (!serviceAccount) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON.");

  const [fixtures, apiMatches] = await Promise.all([
    fetchFirestoreCollection(projectId, serviceAccount, "fixtures"),
    fetchPrimaryOrBackupMatches(zafronixKey, livescoreApiKey, livescoreApiSecret),
  ]);

  const matchedUpdates = [];
  for (const item of apiMatches) {
    const homeTeam = cleanTeamName(item.homeTeam || item.team1 || "");
    const awayTeam = cleanTeamName(item.awayTeam || item.team2 || "");
    if (!homeTeam || !awayTeam) continue;

    const matched = fixtures.find((f) => {
      const dbHome = cleanTeamName(f.team1);
      const dbAway = cleanTeamName(f.team2);
      return (
        (dbHome === homeTeam && dbAway === awayTeam) ||
        (dbHome === awayTeam && dbAway === homeTeam)
      );
    });

    if (!matched) continue;

    matchedUpdates.push({
      matchId: String(matched.matchId),
      score1: toNullableNumber(readScore(item, "home")),
      score2: toNullableNumber(readScore(item, "away")),
      status: mapStatus(item.status),
      lastUpdated: new Date().toISOString(),
    });
  }

  const token = await getAccessToken(serviceAccount);
  await Promise.all(
    matchedUpdates.map((update) =>
      writeResult(projectId, token, update),
    ),
  );

  return jsonResponse({
    success: true,
    matched: matchedUpdates.length,
    updated: matchedUpdates.length,
  });
}

function isAuthorized(request, env) {
  const token = env.SEED_TOKEN;
  if (!token) return false;
  const header = request.headers.get("Authorization") || "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  return header === `Bearer ${token}` || queryToken === token;
}

async function fetchPrimaryOrBackupMatches(zafronixKey, livescoreApiKey, livescoreApiSecret) {
  try {
    return await fetchWorldcup26Matches();
  } catch (error) {
    console.warn("worldcup26.ir failed, falling back to Zafronix / livescore-api.com:", error.message);
  }

  try {
    if (zafronixKey) {
      return await fetchZafronixMatches(zafronixKey);
    }
  } catch (error) {
    console.warn("Zafronix failed, falling back to livescore-api.com:", error.message);
  }

  if (!livescoreApiKey || !livescoreApiSecret) {
    throw new Error("No working live API configured.");
  }

  return fetchLivescoreMatches(livescoreApiKey, livescoreApiSecret);
}

async function fetchWorldcup26Matches() {
  const response = await fetch(WORLDCUP26_GAMES_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`worldcup26.ir HTTP ${response.status}`);
  const data = await response.json();
  return normalizeWorldcup26Games(data);
}

async function fetchZafronixMatches(apiKey) {
  const response = await fetch(ZAFRONIX_URL, {
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Zafronix HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : data.matches || [];
}

async function fetchLivescoreMatches(apiKey, apiSecret) {
  const [fixturesResponse, liveResponse] = await Promise.all([
    fetch(`${LIVESCORE_FIXTURES_URL}&key=${encodeURIComponent(apiKey)}&secret=${encodeURIComponent(apiSecret)}`),
    fetch(`${LIVESCORE_LIVE_URL}&key=${encodeURIComponent(apiKey)}&secret=${encodeURIComponent(apiSecret)}`),
  ]);

  if (!fixturesResponse.ok) {
    throw new Error(`Livescore fixtures HTTP ${fixturesResponse.status}`);
  }
  if (!liveResponse.ok) {
    throw new Error(`Livescore live HTTP ${liveResponse.status}`);
  }

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

async function fetchFirestoreCollection(projectId, serviceAccount, collectionId) {
  const token = await getAccessToken(serviceAccount);
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}?pageSize=500`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Firestore HTTP ${response.status}`);
  const data = await response.json();
  return (data.documents || []).map((doc) => {
    const fields = doc.fields || {};
    return {
      id: doc.name?.split("/").pop(),
      matchId: readField(fields, "matchId") || doc.id?.replace(/^match_/, ""),
      team1: readField(fields, "team1") || "",
      team2: readField(fields, "team2") || "",
    };
  });
}

async function writeResult(projectId, token, update) {
  const docId = `match_${update.matchId}`;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/results/${docId}`;
  const body = {
    fields: {
      matchId: { stringValue: update.matchId },
      score1:
        update.score1 === null
          ? { nullValue: null }
          : { integerValue: String(update.score1) },
      score2:
        update.score2 === null
          ? { nullValue: null }
          : { integerValue: String(update.score2) },
      status: { stringValue: update.status },
      lastUpdated: { stringValue: update.lastUpdated },
    },
  };

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore write failed ${response.status}: ${text}`);
  }
}

function cleanTeamName(name) {
  let clean = String(name || "")
    .toLowerCase()
    .replace(/\band\b/g, "")
    .replace(/&/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (clean === "korearepublic" || clean === "repofkorea" || clean === "koreasouth") return "southkorea";
  if (clean === "unitedstates" || clean === "unitedstatesofamerica") return "usa";
  if (clean === "czechia") return "czechrepublic";
  if (clean === "cotedivoire" || clean === "ivorycoast") return "ivorycoast";
  if (clean === "curaao" || clean === "curacao") return "curacao";
  if (clean === "drcongo" || clean === "congodr" || clean === "democraticrepublicofcongo" || clean === "congodemocraticrepublic") return "drcongo";
  if (clean === "capeverde" || clean === "caboverde") return "capeverde";
  return clean;
}

function mapStatus(zStatus) {
  if (!zStatus) return "NS";
  const s = String(zStatus).toLowerCase();
  if (["completed", "finished", "ft", "full-time", "fulltime"].includes(s)) return "FT";
  if (["halftime", "ht", "half-time"].includes(s)) return "HT";
  if (["live", "in_play", "inplay", "1h", "first half"].includes(s)) return "1H";
  if (["second half", "2h"].includes(s)) return "2H";
  if (["aet", "extra time", "extra-time"].includes(s)) return "AET";
  if (["pen", "penalties", "pens"].includes(s)) return "PEN";
  return "NS";
}

function readScore(item, side) {
  const keys =
    side === "home"
      ? ["homeScore", "score1", "team1Score", "home_goal", "homeGoals", "goalsHome"]
      : ["awayScore", "score2", "team2Score", "away_goal", "awayGoals", "goalsAway"];
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== "") return item[key];
  }
  const nested = item.score || item.result || item.scores;
  if (nested && typeof nested === "object") {
    const paths =
      side === "home"
        ? [["home"], ["local"], ["team1"], ["fulltime", "home"], ["ft", "home"], ["final", "home"]]
        : [["away"], ["visitor"], ["team2"], ["fulltime", "away"], ["ft", "away"], ["final", "away"]];
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
      if (found && value !== undefined && value !== null && value !== "") return value;
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

function buildLivescoreKey(item) {
  const home = cleanTeamName(
    item.home_name || item.home || item.team1 || item.localteam_name || item.localteam || "",
  );
  const away = cleanTeamName(
    item.away_name || item.away || item.team2 || item.visitorteam_name || item.visitorteam || "",
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
    matchId: String(game.id || game.matchId || ""),
    homeTeam: game.home_team_name_en || game.home_team_label || game.home_team || "",
    awayTeam: game.away_team_name_en || game.away_team_label || game.away_team || "",
    homeScore: readGameScore(game, "home"),
    awayScore: readGameScore(game, "away"),
    status: mapWorldcup26Status(game),
    timeElapsed: game.time_elapsed || "",
    finished: game.finished,
    localDate: game.local_date || "",
  }));
}

function readGameScore(game, side) {
  return side === "home"
    ? game.home_score ?? game.score1 ?? game.homeScore ?? null
    : game.away_score ?? game.score2 ?? game.awayScore ?? null;
}

function mapWorldcup26Status(game) {
  if (String(game.finished).toLowerCase() === "true") return "FT";
  const elapsed = String(game.time_elapsed || "").toLowerCase();
  if (elapsed && elapsed !== "notstarted") return "LIVE";
  return "NS";
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function readField(fields, key) {
  const field = fields[key];
  if (!field) return null;
  return field.stringValue ?? field.integerValue ?? field.doubleValue ?? null;
}

function parseJsonSecret(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
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
  return tokenData.access_token;
}

async function importPrivateKey(pem) {
  const cleaned = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = base64ToArrayBuffer(cleaned);
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
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

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
