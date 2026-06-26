/**
 * sync-firestore-to-supabase.js
 * Copies missing results, predictions, users, and accountRequests
 * from Firestore → Supabase to close the data gap.
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
  let raw = vars.FIREBASE_SERVICE_ACCOUNT_JSON || "";
  if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
  SERVICE_ACCOUNT = JSON.parse(raw);
} catch (e) {
  console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e.message);
  process.exit(1);
}

// ─── Firestore Auth ─────────────────────────────────────────────────────────

function buildJwt(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email, sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore",
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  return `${unsigned}.${sign.sign(sa.private_key, "base64url")}`;
}

async function getToken() {
  const jwt = buildJwt(SERVICE_ACCOUNT);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return (await res.json()).access_token;
}

// ─── Firestore Read ─────────────────────────────────────────────────────────

function extractValue(val) {
  if (!val || typeof val !== "object") return val;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return val.doubleValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("nullValue" in val) return null;
  if ("timestampValue" in val) return val.timestampValue;
  if ("mapValue" in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) obj[k] = extractValue(v);
    return obj;
  }
  if ("arrayValue" in val) return (val.arrayValue.values || []).map(extractValue);
  return val;
}

async function firestoreRead(token, collection) {
  const allDocs = [];
  let pageToken = "";
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}`;
  while (true) {
    const url = pageToken ? `${base}?pageSize=300&pageToken=${pageToken}` : `${base}?pageSize=300`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Firestore ${collection} HTTP ${res.status}`);
    const data = await res.json();
    for (const doc of (data.documents || [])) {
      const id = doc.name.split("/").pop();
      const fields = {};
      for (const [k, v] of Object.entries(doc.fields || {})) fields[k] = extractValue(v);
      fields._docId = id;
      allDocs.push(fields);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return allDocs;
}

// ─── Supabase Read / Write ──────────────────────────────────────────────────

async function supabaseSelect(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return [];
  return await res.json();
}

async function supabaseUpsert(table, rows, conflictKey) {
  if (!rows.length) return { ok: true, count: 0 };
  // Upsert in batches of 50
  let total = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: `resolution=merge-duplicates`,
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`  ❌ Supabase ${table} upsert failed (batch ${i}): HTTP ${res.status} — ${body.slice(0, 300)}`);
      return { ok: false, count: total };
    }
    total += batch.length;
  }
  return { ok: true, count: total };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 Syncing Firestore → Supabase...\n");

  const token = await getToken();
  console.log("✅ Firestore auth OK\n");

  // ── 1. Results ──────────────────────────────────────────────
  console.log("📦 Results...");
  const [fsResults, sbResults] = await Promise.all([
    firestoreRead(token, "results"),
    supabaseSelect("results"),
  ]);

  const sbResultKeys = new Set(sbResults.map(r =>
    String(r.matchId || r.id || "").replace(/^match_/, "")
  ));

  // Find results in Firestore that are FT but missing/stale in Supabase
  const FINAL = ["FT", "AET", "PEN", "COMPLETED", "FINAL"];
  const missingResults = [];
  for (const r of fsResults) {
    const key = String(r.matchId || r._docId || "").replace(/^match_/, "");
    const status = String(r.status || "").toUpperCase();
    if (!FINAL.includes(status)) continue;
    if (r.score1 == null || r.score2 == null) continue;

    // Check if Supabase has stale data for this match
    const sbRow = sbResults.find(s =>
      String(s.matchId || s.id || "").replace(/^match_/, "") === key
    );
    if (!sbRow || !FINAL.includes(String(sbRow.status || "").toUpperCase())) {
      missingResults.push({
        matchId: key,
        score1: Number(r.score1),
        score2: Number(r.score2),
        status: status === "COMPLETED" ? "FT" : status,
        lastUpdated: r.lastUpdated || new Date().toISOString(),
      });
    }
  }

  if (missingResults.length) {
    console.log(`  Found ${missingResults.length} results to sync:`);
    for (const r of missingResults) {
      console.log(`    Match ${r.matchId}: ${r.score1}-${r.score2} (${r.status})`);
    }
    const res = await supabaseUpsert("results", missingResults);
    console.log(`  ${res.ok ? "✅" : "❌"} Upserted ${res.count} results\n`);
  } else {
    console.log("  ✅ No missing results\n");
  }

  // ── 2. Predictions ─────────────────────────────────────────
  console.log("📦 Predictions...");
  const [fsPredictions, sbPredictions] = await Promise.all([
    firestoreRead(token, "predictions"),
    supabaseSelect("predictions"),
  ]);

  const sbPredKeys = new Set(sbPredictions.map(p =>
    String(p.id || `${p.username}_${p.matchId}` || "")
  ));

  const missingPreds = [];
  for (const p of fsPredictions) {
    const id = String(p._docId || p.id || `${p.username}_${p.matchId}`);
    if (sbPredKeys.has(id)) continue;
    if (p.pred1 == null || p.pred2 == null) continue;

    missingPreds.push({
      id: id,
      username: String(p.username || ""),
      matchId: String(p.matchId || "").replace(/^match_/, ""),
      pred1: Number(p.pred1),
      pred2: Number(p.pred2),
      submittedAt: p.updatedAt || p.timestamp || p.submittedAt || new Date().toISOString(),
    });
  }

  if (missingPreds.length) {
    console.log(`  Found ${missingPreds.length} predictions to sync`);
    const res = await supabaseUpsert("predictions", missingPreds);
    console.log(`  ${res.ok ? "✅" : "❌"} Upserted ${res.count} predictions\n`);
  } else {
    console.log("  ✅ No missing predictions\n");
  }

  // ── 3. Users ───────────────────────────────────────────────
  console.log("📦 Users...");
  const [fsUsers, sbUsers] = await Promise.all([
    firestoreRead(token, "users"),
    supabaseSelect("users"),
  ]);

  const sbUserKeys = new Set(sbUsers.map(u => String(u.username || u.id || "")));
  const missingUsers = [];
  for (const u of fsUsers) {
    const username = String(u.username || u._docId || "");
    if (!username || sbUserKeys.has(username)) continue;
    missingUsers.push({
      username,
      displayName: u.displayName || username,
      secretCode: u.secretCode || "",
      isAdmin: Boolean(u.isAdmin),
    });
  }

  if (missingUsers.length) {
    console.log(`  Found ${missingUsers.length} users to sync: ${missingUsers.map(u => u.username).join(", ")}`);
    const res = await supabaseUpsert("users", missingUsers);
    console.log(`  ${res.ok ? "✅" : "❌"} Upserted ${res.count} users\n`);
  } else {
    console.log("  ✅ No missing users\n");
  }

  // ── 4. Account Requests ────────────────────────────────────
  console.log("📦 Account Requests...");
  const [fsRequests, sbRequests] = await Promise.all([
    firestoreRead(token, "accountRequests"),
    supabaseSelect("accountRequests"),
  ]);

  const sbReqKeys = new Set(sbRequests.map(r => String(r.username || r.id || "")));
  const missingReqs = [];
  for (const r of fsRequests) {
    const username = String(r.username || r._docId || "");
    if (!username || sbReqKeys.has(username)) continue;
    missingReqs.push({
      username,
      displayName: r.displayName || "",
      note: r.note || "",
      status: r.status || "pending",
      secretCode: r.secretCode || "",
      createdAt: r.createdAt || new Date().toISOString(),
    });
  }

  if (missingReqs.length) {
    console.log(`  Found ${missingReqs.length} requests to sync: ${missingReqs.map(r => r.username).join(", ")}`);
    const res = await supabaseUpsert("accountRequests", missingReqs);
    console.log(`  ${res.ok ? "✅" : "❌"} Upserted ${res.count} requests\n`);
  } else {
    console.log("  ✅ No missing requests\n");
  }

  console.log("═".repeat(50));
  console.log("✅ Sync complete. Refresh the app to see updated data.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
