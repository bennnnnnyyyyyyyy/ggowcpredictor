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
  // ── Original users ──
  { id: "ben_arthur",       displayName: "Ben Arthur",       secretCode: "GGO2026", isAdmin: true  },
  { id: "jimmy",            displayName: "Jimmy",            secretCode: "GGO2026", isAdmin: false },
  { id: "jane",             displayName: "Jane",             secretCode: "GGO2026", isAdmin: false },
  { id: "selene",           displayName: "Selene",           secretCode: "GGO2026", isAdmin: false },

  // ── New users ──
  { id: "katherine.adams",  displayName: "Katherine Adams",  secretCode: "GGO2026", isAdmin: false },
  { id: "sam.richards",     displayName: "Sam Richards",     secretCode: "GGO2026", isAdmin: false },
  { id: "anna.nelson",      displayName: "Anna Nelson",      secretCode: "GGO2026", isAdmin: false },
  { id: "steven.adams",     displayName: "Steven Adams",     secretCode: "GGO2026", isAdmin: false },
  { id: "steve.winchester", displayName: "Steve Winchester", secretCode: "GGO2026", isAdmin: false },
  { id: "celine.dami",      displayName: "Celine Dami",      secretCode: "GGO2026", isAdmin: false },
  { id: "monika.miller",    displayName: "Monika Miller",    secretCode: "GGO2026", isAdmin: false },
  { id: "heaven.davis",     displayName: "Heaven Davis",     secretCode: "GGO2026", isAdmin: false },
  { id: "maddy.snow",       displayName: "Maddy Snow",       secretCode: "GGO2026", isAdmin: false },
  { id: "blake.hunter",     displayName: "Blake Hunter",     secretCode: "GGO2026", isAdmin: false },
  { id: "jules.brown",      displayName: "Jules Brown",      secretCode: "GGO2026", isAdmin: false },
  { id: "mary.miller",      displayName: "Mary Smith",       secretCode: "GGO2026", isAdmin: false },
  { id: "ben.camel",        displayName: "Ben Kamel",        secretCode: "GGO2026", isAdmin: false },
  { id: "lizfoxwiz97",      displayName: "Liz Fox",          secretCode: "GGO2026", isAdmin: false },
  { id: "michael.morgan",   displayName: "Michael Morgan",   secretCode: "GGO2026", isAdmin: false },
  { id: "bella.cameron",    displayName: "Bella Cameron",    secretCode: "GGO2026", isAdmin: false },
  { id: "oscar.kamel",      displayName: "Oscar Kamel",      secretCode: "GGO2026", isAdmin: false },
  { id: "marcy.miller",     displayName: "Marcy Miller",     secretCode: "GGO2026", isAdmin: false },
  { id: "demon.smith",      displayName: "Demon Smith",      secretCode: "GGO2026", isAdmin: false },
  { id: "ivy.bennett",      displayName: "Ivy Bennett",      secretCode: "GGO2026", isAdmin: false },
  { id: "david.green",      displayName: "David Green",      secretCode: "GGO2026", isAdmin: false },
  { id: "haley.roberson",   displayName: "Haley Roberson",   secretCode: "GGO2026", isAdmin: false },
  { id: "donna.bell",       displayName: "Donna Bell",       secretCode: "GGO2026", isAdmin: false },
  { id: "laura.miller",     displayName: "Laura Miller",     secretCode: "GGO2026", isAdmin: false },
  { id: "luke.grant",       displayName: "Luke Grant",       secretCode: "GGO2026", isAdmin: false },
  { id: "riley.miller",     displayName: "Riley Miller",     secretCode: "GGO2026", isAdmin: false },
  { id: "stewart.martin",   displayName: "Stewart Martin",   secretCode: "GGO2026", isAdmin: false },
  { id: "jessie.moore",     displayName: "Jessie Moore",     secretCode: "GGO2026", isAdmin: false },
  { id: "grace.smith",      displayName: "Grace Smith",      secretCode: "GGO2026", isAdmin: false },
  { id: "josh.adams",       displayName: "Josh Adams",       secretCode: "GGO2026", isAdmin: false },
  { id: "natalie.wilson",   displayName: "Natalie Wilson",   secretCode: "GGO2026", isAdmin: false },
  { id: "roben.neves",      displayName: "Roben Neves",      secretCode: "GGO2026", isAdmin: false },
  { id: "mia.cooper",       displayName: "Mia Cooper",       secretCode: "GGO2026", isAdmin: false },
  { id: "dexter.lane",      displayName: "Dexter Lane",      secretCode: "GGO2026", isAdmin: false },
  { id: "leon.smith",       displayName: "Leon Smith",       secretCode: "GGO2026", isAdmin: false },
  { id: "jane.white",       displayName: "Jane White",       secretCode: "GGO2026", isAdmin: false },
  { id: "brodie.armin",     displayName: "Brodie Armin",     secretCode: "GGO2026", isAdmin: false },
  { id: "lori.anderson",    displayName: "Lori Anderson",    secretCode: "GGO2026", isAdmin: false },
  { id: "olivia.black",     displayName: "Olivia Black",     secretCode: "GGO2026", isAdmin: false },
  { id: "iris.brown",       displayName: "Iris Brown",       secretCode: "GGO2026", isAdmin: false },
  { id: "tonny.smith",      displayName: "Tony Smith",       secretCode: "GGO2026", isAdmin: false },
  { id: "adam.white",       displayName: "Adam White",       secretCode: "GGO2026", isAdmin: false },
  { id: "daisy.parker",     displayName: "Daisy Parker",     secretCode: "GGO2026", isAdmin: false },
  { id: "phoebe.brown",     displayName: "Phoebe Brown",     secretCode: "GGO2026", isAdmin: false },
  { id: "melanie.brown",    displayName: "Melanie Brown",    secretCode: "GGO2026", isAdmin: false },
  { id: "jeremy.welson",    displayName: "Jeremy Wilson",    secretCode: "GGO2026", isAdmin: false },
  { id: "frank.clarkson",   displayName: "Frank Clarkson",   secretCode: "GGO2026", isAdmin: false },
  { id: "rickk.nelson",     displayName: "Rick Nelson",      secretCode: "GGO2026", isAdmin: false },
  { id: "rose.simon",       displayName: "Rose Simon",       secretCode: "GGO2026", isAdmin: false },
  { id: "alex.woods",       displayName: "Alex Woods",       secretCode: "GGO2026", isAdmin: false },
  { id: "nora.atkins",      displayName: "Nora Atkins",      secretCode: "GGO2026", isAdmin: false },
  { id: "nova.grace",       displayName: "Nova Grace",       secretCode: "GGO2026", isAdmin: false },
  { id: "hope.smith",       displayName: "Hope Smith",       secretCode: "GGO2026", isAdmin: false },
  { id: "caroline.richards",displayName: "Caroline Richards",secretCode: "GGO2026", isAdmin: false },
  { id: "jasmine.green",    displayName: "Jasmine Green",    secretCode: "GGO2026", isAdmin: false },
  { id: "tim.miller",       displayName: "Tim Miller",       secretCode: "GGO2026", isAdmin: false },
  { id: "cobe.jones",       displayName: "Coby Jones",       secretCode: "GGO2026", isAdmin: false },
  { id: "ray.parker",       displayName: "Ray Parker",       secretCode: "GGO2026", isAdmin: false },
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