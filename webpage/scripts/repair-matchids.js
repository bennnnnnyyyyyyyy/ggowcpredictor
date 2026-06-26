#!/usr/bin/env node
/**
 * Repair leaderboard matchId mapping:
 * 1. Backfill fixtures.apiFixtureId from worldcup26.ir (team-name match)
 * 2. Upsert missing results using internal fixtures.matchId (never API game.id)
 * 3. Remove orphan results whose matchId is an API id with no fixture row
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/repair-matchids.js
 *   node scripts/repair-matchids.js --dry-run
 */

const WORLDCUP26_GAMES_URL = "https://worldcup26.ir/get/games";
const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
)
  .replace(/\/rest\/v1\/?$/, "")
  .replace(/\/$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_KEY).");
  process.exit(1);
}

function supabaseHeaders(extra) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...(extra || {}),
  };
}

async function supabaseSelect(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(query || "*")}`;
  const response = await fetch(url, { headers: supabaseHeaders() });
  if (!response.ok) {
    throw new Error(`GET ${table} HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function supabaseUpsert(table, rows) {
  if (!rows.length) return;
  const conflictKeys = {
    fixtures: "matchId",
    results: "matchId",
    leaderboard: "username",
  };
  const conflict = conflictKeys[table];
  const url = `${SUPABASE_URL}/rest/v1/${table}${conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : ""}`;
  const response = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(`UPSERT ${table} HTTP ${response.status}: ${await response.text()}`);
  }
}

async function supabaseDelete(table, matchIds) {
  if (!matchIds.length) return;
  const filter = `matchId=in.(${matchIds.map(encodeURIComponent).join(",")})`;
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: supabaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`DELETE ${table} HTTP ${response.status}: ${await response.text()}`);
  }
}

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
  if (clean === "unitedstates" || clean === "unitedstatesofamerica") return "usa";
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
    const matchId = normalizeMatchId(fixture.matchId);
    if (fixture.apiFixtureId != null) {
      byApiId.set(String(fixture.apiFixtureId), fixture);
    }
    const home = cleanTeamName(fixture.team1);
    const away = cleanTeamName(fixture.team2);
    if (home && away) {
      byTeams.set(`${home}__${away}`, { fixture, flipped: false });
      byTeams.set(`${away}__${home}`, { fixture, flipped: true });
    }
  }
  return { byApiId, byTeams, fixtureIds: new Set(fixtureRows.map((f) => normalizeMatchId(f.matchId))) };
}

function resolveFixtureMatch(item, lookups) {
  const apiGameId = item.apiGameId ?? null;
  const homeTeam = cleanTeamName(item.homeTeam || "");
  const awayTeam = cleanTeamName(item.awayTeam || "");
  if (!homeTeam || !awayTeam) return null;

  if (apiGameId) {
    const byId = lookups.byApiId.get(String(apiGameId));
    if (byId) {
      const dbHome = cleanTeamName(byId.team1);
      const dbAway = cleanTeamName(byId.team2);
      return { fixture: byId, flipped: dbHome === awayTeam && dbAway === homeTeam };
    }
  }

  return lookups.byTeams.get(`${homeTeam}__${awayTeam}`) || null;
}

function mapWorldcup26Status(game) {
  if (String(game.finished).toLowerCase() === "true") return "FT";
  const elapsed = String(game.time_elapsed || "").toLowerCase();
  if (elapsed && elapsed !== "notstarted") return "LIVE";
  return "NS";
}

function readGameScore(game, side) {
  const value =
    side === "home"
      ? (game.home_score ?? game.score1 ?? game.homeScore ?? null)
      : (game.away_score ?? game.score2 ?? game.awayScore ?? null);
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeWorldcup26Games(payload) {
  const games = Array.isArray(payload) ? payload : payload?.games || [];
  return games.map((game) => ({
    apiGameId: String(game.id || game.matchId || ""),
    homeTeam:
      game.home_team_name_en || game.home_team_label || game.home_team || "",
    awayTeam:
      game.away_team_name_en || game.away_team_label || game.away_team || "",
    homeScore: readGameScore(game, "home"),
    awayScore: readGameScore(game, "away"),
    status: mapWorldcup26Status(game),
  }));
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE RUN — will write to Supabase");

  const [fixtureRows, resultRows, apiRaw] = await Promise.all([
    supabaseSelect("fixtures", "*"),
    supabaseSelect("results", "*"),
    fetch(WORLDCUP26_GAMES_URL, { headers: { Accept: "application/json" } }).then((r) =>
      r.json(),
    ),
  ]);

  const apiMatches = normalizeWorldcup26Games(apiRaw);
  let lookups = buildFixtureLookups(fixtureRows);

  const fixtureApiUpdates = [];
  const resultUpserts = [];
  const resultIds = new Set(resultRows.map((r) => normalizeMatchId(r.matchId)));

  for (const item of apiMatches) {
    const resolved = resolveFixtureMatch(item, lookups);
    if (!resolved) continue;

    const { fixture, flipped } = resolved;
    const internalMatchId = normalizeMatchId(fixture.matchId);
    const apiGameId = Number(item.apiGameId);

    if (!fixture.apiFixtureId && Number.isFinite(apiGameId)) {
      fixtureApiUpdates.push({ matchId: internalMatchId, apiFixtureId: apiGameId });
      fixture.apiFixtureId = apiGameId;
      lookups.byApiId.set(String(apiGameId), fixture);
    }

    if (item.status === "NS" || item.homeScore === null || item.awayScore === null) {
      continue;
    }

    resultUpserts.push({
      matchId: internalMatchId,
      score1: flipped ? item.awayScore : item.homeScore,
      score2: flipped ? item.homeScore : item.awayScore,
      status: item.status,
      lastUpdated: new Date().toISOString(),
    });
  }

  const missingResults = resultUpserts.filter((r) => !resultIds.has(r.matchId));
  const orphanResults = resultRows.filter((r) => {
    const matchId = normalizeMatchId(r.matchId);
    if (lookups.fixtureIds.has(matchId)) return false;
    return lookups.byApiId.has(matchId);
  });

  console.log(
    JSON.stringify(
      {
        fixtures: fixtureRows.length,
        resultsBefore: resultRows.length,
        apiFixtureIdsToBackfill: fixtureApiUpdates.length,
        finishedResultsToUpsert: resultUpserts.length,
        missingResults: missingResults.length,
        orphanApiIdResults: orphanResults.length,
        sampleMissing: missingResults.slice(0, 8).map((r) => r.matchId),
        sampleOrphans: orphanResults.slice(0, 8).map((r) => r.matchId),
      },
      null,
      2,
    ),
  );

  if (DRY_RUN) return;

  if (fixtureApiUpdates.length) {
    await supabaseUpsert("fixtures", fixtureApiUpdates);
    console.log(`Backfilled apiFixtureId on ${fixtureApiUpdates.length} fixtures`);
  }

  if (resultUpserts.length) {
    await supabaseUpsert("results", resultUpserts);
    console.log(`Upserted ${resultUpserts.length} results using internal matchId`);
  }

  if (orphanResults.length) {
    await supabaseDelete(
      "results",
      orphanResults.map((r) => normalizeMatchId(r.matchId)),
    );
    console.log(`Deleted ${orphanResults.length} orphan results stored with API ids`);
  }

  console.log("Done. Run /sync-scores on the worker to recalculate the leaderboard.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
