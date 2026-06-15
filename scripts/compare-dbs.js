/**
 * compare-dbs.js — Supabase vs Firestore gap analysis
 * Usage: node scripts/compare-dbs.js
 *
 * Reads credentials from .dev.vars, queries both databases,
 * and prints a side-by-side comparison.
 */

import { readFileSync } from "fs";
import { createSign } from "crypto";

// ─── Load .dev.vars ─────────────────────────────────────────────────────────
const vars = {};
readFileSync(".dev.vars", "utf-8").split("\n").forEach((line) => {
  const m = line.match(/^(\w+)=["']?(.*?)["']?\s*$/);
  if (m) vars[m[1]] = m[2];
});

const SUPABASE_URL = vars.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY = vars.SUPABASE_KEY;
const PROJECT_ID = vars.FIREBASE_PROJECT_ID || "ggowcpredictor";

let SERVICE_ACCOUNT;
try {
  // The value in .dev.vars is wrapped in single quotes and may have literal \n
  let raw = vars.FIREBASE_SERVICE_ACCOUNT_JSON || "";
  if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
  SERVICE_ACCOUNT = JSON.parse(raw);
} catch (e) {
  console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e.message);
  process.exit(1);
}

const COLLECTIONS = ["fixtures", "results", "predictions", "users", "leaderboard", "accountRequests"];

// ─── Supabase helpers ───────────────────────────────────────────────────────

async function supabaseSelect(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `HTTP ${res.status}: ${body.slice(0, 200)}`, rows: [] };
  }
  const rows = await res.json();
  return { error: null, rows: Array.isArray(rows) ? rows : [] };
}

// ─── Firestore helpers (service account JWT) ────────────────────────────────

function buildJwt(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore",
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, "base64url");
  return `${unsigned}.${signature}`;
}

async function getFirestoreToken() {
  const jwt = buildJwt(SERVICE_ACCOUNT);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

function extractFirestoreValue(val) {
  if (!val || typeof val !== "object") return val;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return val.doubleValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("nullValue" in val) return null;
  if ("timestampValue" in val) return val.timestampValue;
  if ("mapValue" in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = extractFirestoreValue(v);
    }
    return obj;
  }
  if ("arrayValue" in val) {
    return (val.arrayValue.values || []).map(extractFirestoreValue);
  }
  return val;
}

async function firestoreCollection(token, collection) {
  const allDocs = [];
  let pageToken = "";
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}`;

  while (true) {
    const url = pageToken ? `${base}?pageSize=300&pageToken=${pageToken}` : `${base}?pageSize=300`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { error: `HTTP ${res.status}: ${body.slice(0, 200)}`, rows: [] };
    }
    const data = await res.json();
    const docs = data.documents || [];
    for (const doc of docs) {
      const id = doc.name.split("/").pop();
      const fields = {};
      for (const [k, v] of Object.entries(doc.fields || {})) {
        fields[k] = extractFirestoreValue(v);
      }
      fields._docId = id;
      allDocs.push(fields);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return { error: null, rows: allDocs };
}

// ─── Comparison logic ───────────────────────────────────────────────────────

function getKey(collection, row) {
  switch (collection) {
    case "fixtures":
      return String(row.matchId || row.id || row._docId || "").replace(/^match_/, "");
    case "results":
      return String(row.matchId || row.id || row._docId || "").replace(/^match_/, "");
    case "predictions":
      return String(row.id || row._docId || `${row.username}_${row.matchId}` || "");
    case "users":
      return String(row.username || row.id || row._docId || "");
    case "leaderboard":
      return String(row.username || row.id || row._docId || "");
    case "accountRequests":
      return String(row.username || row.id || row._docId || "");
    default:
      return String(row.id || row._docId || JSON.stringify(row).slice(0, 40));
  }
}

function compareRows(collection, sRows, fRows) {
  const sMap = new Map();
  const fMap = new Map();

  for (const r of sRows) sMap.set(getKey(collection, r), r);
  for (const r of fRows) fMap.set(getKey(collection, r), r);

  const onlySupabase = [];
  const onlyFirestore = [];
  const diffs = [];

  for (const [key, sRow] of sMap) {
    if (!fMap.has(key)) {
      onlySupabase.push(key);
    } else if (collection === "results") {
      // Deep-compare scores for results
      const fRow = fMap.get(key);
      const s1 = Number(sRow.score1), s2 = Number(sRow.score2);
      const f1 = Number(fRow.score1), f2 = Number(fRow.score2);
      const sStatus = String(sRow.status || "").toUpperCase();
      const fStatus = String(fRow.status || "").toUpperCase();
      if (s1 !== f1 || s2 !== f2 || sStatus !== fStatus) {
        diffs.push({ key, supabase: { score1: s1, score2: s2, status: sStatus }, firestore: { score1: f1, score2: f2, status: fStatus } });
      }
    }
  }
  for (const [key] of fMap) {
    if (!sMap.has(key)) onlyFirestore.push(key);
  }

  return { onlySupabase, onlyFirestore, diffs, sCount: sRows.length, fCount: fRows.length };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Supabase vs Firestore Gap Analysis");
  console.log("═".repeat(60));
  console.log();

  // Get Firestore auth token
  let fsToken;
  try {
    fsToken = await getFirestoreToken();
    console.log("✅ Firestore auth token acquired");
  } catch (e) {
    console.error("❌ Firestore auth failed:", e.message);
    process.exit(1);
  }

  console.log(`✅ Supabase URL: ${SUPABASE_URL}`);
  console.log();

  const report = [];

  for (const collection of COLLECTIONS) {
    console.log(`📦 Checking: ${collection}...`);
    const [sResult, fResult] = await Promise.all([
      supabaseSelect(collection),
      firestoreCollection(fsToken, collection),
    ]);

    if (sResult.error && fResult.error) {
      report.push({ collection, sError: sResult.error, fError: fResult.error });
      continue;
    }

    const comparison = compareRows(
      collection,
      sResult.error ? [] : sResult.rows,
      fResult.error ? [] : fResult.rows,
    );

    report.push({
      collection,
      sError: sResult.error,
      fError: fResult.error,
      ...comparison,
    });
  }

  // Print report
  console.log();
  console.log("═".repeat(60));
  console.log("📊 GAP REPORT");
  console.log("═".repeat(60));
  console.log();

  // Summary table
  console.log("┌─────────────────┬───────────┬───────────┬──────┬────────────┬────────────┬───────┐");
  console.log("│ Collection      │ Supabase  │ Firestore │ Gap  │ Only in SB │ Only in FS │ Diffs │");
  console.log("├─────────────────┼───────────┼───────────┼──────┼────────────┼────────────┼───────┤");

  for (const r of report) {
    const sCount = r.sError ? "ERR" : String(r.sCount).padStart(4);
    const fCount = r.fError ? "ERR" : String(r.fCount).padStart(4);
    const gap = (r.sError || r.fError) ? "N/A" : String(Math.abs((r.sCount || 0) - (r.fCount || 0))).padStart(3);
    const onlySB = r.onlySupabase ? String(r.onlySupabase.length).padStart(5) : "  N/A";
    const onlyFS = r.onlyFirestore ? String(r.onlyFirestore.length).padStart(5) : "  N/A";
    const diffs = r.diffs ? String(r.diffs.length).padStart(3) : "N/A";
    const name = r.collection.padEnd(15);
    console.log(`│ ${name} │   ${sCount}    │   ${fCount}    │ ${gap}  │    ${onlySB}   │    ${onlyFS}   │  ${diffs}  │`);
  }
  console.log("└─────────────────┴───────────┴───────────┴──────┴────────────┴────────────┴───────┘");
  console.log();

  // Details
  for (const r of report) {
    if (r.sError) console.log(`⚠️  ${r.collection} Supabase error: ${r.sError}`);
    if (r.fError) console.log(`⚠️  ${r.collection} Firestore error: ${r.fError}`);

    if (r.onlySupabase?.length) {
      console.log(`\n🟦 ${r.collection} — Only in Supabase (${r.onlySupabase.length}):`);
      r.onlySupabase.slice(0, 20).forEach((k) => console.log(`   • ${k}`));
      if (r.onlySupabase.length > 20) console.log(`   ... and ${r.onlySupabase.length - 20} more`);
    }

    if (r.onlyFirestore?.length) {
      console.log(`\n🟧 ${r.collection} — Only in Firestore (${r.onlyFirestore.length}):`);
      r.onlyFirestore.slice(0, 20).forEach((k) => console.log(`   • ${k}`));
      if (r.onlyFirestore.length > 20) console.log(`   ... and ${r.onlyFirestore.length - 20} more`);
    }

    if (r.diffs?.length) {
      console.log(`\n🔴 ${r.collection} — Score/Status Mismatches (${r.diffs.length}):`);
      for (const d of r.diffs.slice(0, 20)) {
        console.log(`   Match ${d.key}:`);
        console.log(`     Supabase:  ${d.supabase.score1}-${d.supabase.score2} (${d.supabase.status})`);
        console.log(`     Firestore: ${d.firestore.score1}-${d.firestore.score2} (${d.firestore.status})`);
      }
    }
  }

  // Check for the score-flip issue in results
  const resultsReport = report.find((r) => r.collection === "results");
  if (resultsReport && !resultsReport.sError && !resultsReport.fError) {
    console.log("\n" + "═".repeat(60));
    console.log("🔎 SCORE FLIP AUDIT (checking if score1/score2 are swapped)");
    console.log("═".repeat(60));

    const [sRes, fRes] = await Promise.all([
      supabaseSelect("results"),
      supabaseSelect("fixtures"),
    ]);

    if (!sRes.error && !fRes.error) {
      const fixtures = new Map();
      for (const f of fRes.rows) {
        const key = String(f.matchId || f.id || "").replace(/^match_/, "");
        fixtures.set(key, f);
      }

      let flipped = 0;
      for (const r of sRes.rows) {
        const key = String(r.matchId || r.id || "").replace(/^match_/, "");
        const f = fixtures.get(key);
        if (!f || r.score1 == null || r.score2 == null) continue;
        // Just show what we have for manual inspection
        const status = String(r.status || "").toUpperCase();
        if (status === "FT" || status === "COMPLETED" || status === "AET") {
          console.log(`  Match ${key}: ${f.team1} ${r.score1} - ${r.score2} ${f.team2} [${status}]`);
        }
      }
    }
  }

  console.log("\n✅ Comparison complete.");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
