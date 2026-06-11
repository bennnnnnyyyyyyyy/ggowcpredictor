import admin from "firebase-admin";
import cron from "node-cron";
import { readFileSync } from "fs";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "ggowcpredictor";
const ZAFRONIX_KEY = process.env.ZAFRONIX_API_KEY;
const ZAFRONIX_URL =
  process.env.ZAFRONIX_URL ||
  "https://api.zafronix.com/fifa/worldcup/v1/tournaments/2026/matches";
const CRON_SCHEDULE = process.env.LIVE_SYNC_CRON || "*/5 * * * *";
const RUN_ON_START = process.env.LIVE_SYNC_RUN_ON_START !== "false";
const DRY_RUN = process.env.LIVE_SYNC_DRY_RUN === "true";

if (!ZAFRONIX_KEY) {
  console.error("Missing ZAFRONIX_API_KEY in environment.");
  process.exit(1);
}

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      projectId: PROJECT_ID,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT_ID,
    });
  }
}

const db = admin.firestore();
const resultsCol = db.collection("results");
const fixturesCol = db.collection("fixtures");

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
  const directKeys =
    side === "home"
      ? ["homeScore", "score1", "team1Score", "home_goal", "homeGoals", "goalsHome"]
      : ["awayScore", "score2", "team2Score", "away_goal", "awayGoals", "goalsAway"];

  for (const key of directKeys) {
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

async function loadFixtures() {
  const snapshot = await fixturesCol.get();
  const fixtures = [];
  snapshot.forEach((doc) => {
    const f = doc.data() || {};
    fixtures.push({
      id: doc.id,
      matchId: String(f.matchId || doc.id.replace(/^match_/, "")),
      team1: f.team1 || "",
      team2: f.team2 || "",
    });
  });
  return fixtures;
}

async function fetchZafronixMatches() {
  const response = await fetch(ZAFRONIX_URL, {
    headers: {
      "X-API-Key": ZAFRONIX_KEY,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Zafronix HTTP ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : data.matches || [];
}

async function syncResultsOnce() {
  const [fixtures, apiMatches] = await Promise.all([loadFixtures(), fetchZafronixMatches()]);
  const updates = [];

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

    const score1 = readScore(item, "home");
    const score2 = readScore(item, "away");
    const status = mapStatus(item.status);
    const matchId = String(matched.matchId);

    updates.push({
      matchId,
      score1: score1 !== null && score1 !== "" ? Number(score1) : null,
      score2: score2 !== null && score2 !== "" ? Number(score2) : null,
      status,
      lastUpdated: new Date().toISOString(),
    });
  }

  if (DRY_RUN) {
    return { success: true, dryRun: true, matched: updates.length, updates };
  }

  const batch = db.batch();
  for (const update of updates) {
    const ref = resultsCol.doc(`match_${update.matchId}`);
    batch.set(
      ref,
      {
        matchId: update.matchId,
        score1: update.score1,
        score2: update.score2,
        status: update.status,
        lastUpdated: update.lastUpdated,
      },
      { merge: true },
    );
  }
  await batch.commit();

  return { success: true, matched: updates.length, updated: updates.length };
}

async function main() {
  console.log(`Live sync worker started for project ${PROJECT_ID}`);
  if (RUN_ON_START) {
    try {
      const result = await syncResultsOnce();
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error("Initial sync failed:", error);
    }
  }

  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      const result = await syncResultsOnce();
      console.log(`[${new Date().toISOString()}]`, JSON.stringify(result));
    } catch (error) {
      console.error(`[${new Date().toISOString()}] live sync failed:`, error);
    }
  });

  console.log(`Scheduled on cron: ${CRON_SCHEDULE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
