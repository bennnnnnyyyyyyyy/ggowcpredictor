// Run: node scripts/seedDatabase.js
// Requires: npm install firebase (already in package.json)

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch } from "firebase/firestore";
import { readFileSync } from "fs";

const firebaseConfig = {
  apiKey: "AIzaSyAVBLnjdM4cV9vBwV27dl6bEc4ZqVjuFBw",
  authDomain: "ggowcpredictor.firebaseapp.com",
  projectId: "ggowcpredictor",
  storageBucket: "ggowcpredictor.firebasestorage.app",
  messagingSenderId: "126058028551",
  appId: "1:126058028551:web:e60b6e211c3e2e56e154a2",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const USERS = [
  { id: "ben_arthur",  displayName: "Ben Arthur", secretCode: "GGO2026", isAdmin: true  },
  { id: "jimmy",       displayName: "Jimmy",      secretCode: "GGO2026", isAdmin: false },
  { id: "jane",        displayName: "Jane",       secretCode: "GGO2026", isAdmin: false },
  { id: "selene",      displayName: "Selene",     secretCode: "GGO2026", isAdmin: false },
];

function getStage(round = "") {
  const r = round.toLowerCase();
  if (r.includes("matchday") || r.includes("group")) return "group";
  if (r.includes("round of 32")) return "r32";
  if (r.includes("round of 16")) return "r16";
  if (r.includes("quarter")) return "qf";
  if (r.includes("semi")) return "sf";
  if (r.includes("third")) return "third";
  if (r.includes("final")) return "final";
  return "group";
}

async function seed() {
  // ── USERS ──
  console.log("Seeding users...");
  for (const u of USERS) {
    const { id, ...data } = u;
    await setDoc(doc(db, "users", id), { ...data, totalPoints: 0, joinedAt: new Date().toISOString() });
    console.log("  user:", id);
  }

  // ── FIXTURES ──
  console.log("Seeding fixtures...");
  const raw = JSON.parse(readFileSync("2026/worldcup.json", "utf8"));
  const matches = raw.matches || [];

  // Firestore batch writes (max 500 per batch)
  let batch = writeBatch(db);
  let count = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const matchId = String(m.num || i + 1);
    const stage = getStage(m.round);

    const fixture = {
      matchId,
      round: m.round || "",
      group: m.group || (stage === "group" ? "" : null),
      date: m.date || "",
      time: m.time || "",
      kickoffUTC: m.date ? new Date(`${m.date}T${(m.time||"00:00").replace(/\s+UTC.*/, "")}:00Z`).toISOString() : "",
      team1: m.team1 || "TBD",
      team2: m.team2 || "TBD",
      ground: m.ground || "",
      stage,
    };

    batch.set(doc(db, "fixtures", `match_${matchId}`), fixture);
    count++;

    if (count === 499) {
      await batch.commit();
      console.log(`  committed batch of ${count}`);
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`  committed final batch of ${count}`);
  }

  // ── TEAMS ──
  console.log("Seeding teams...");
  const teamsData = JSON.parse(readFileSync("2026/worldcup.teams.json", "utf8"));
  batch = writeBatch(db);
  count = 0;

  for (const team of teamsData) {
    const teamDoc = {
      name: team.name,
      name_normalised: team.name_normalised || team.name,
      fifa_code: team.fifa_code,
      flag_icon: team.flag_icon || "🏳",
      continent: team.continent,
      group: team.group,
      confed: team.confed,
    };

    batch.set(doc(db, "teams", team.fifa_code.toLowerCase()), teamDoc);
    count++;

    if (count === 499) {
      await batch.commit();
      console.log(`  committed batch of ${count}`);
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`  committed final batch of ${count}`);
  }

  console.log(`Done. ${matches.length} fixtures seeded, ${teamsData.length} teams seeded.`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });