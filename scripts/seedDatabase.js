/**
 * FIRESTORE DATABASE SEEDING SCRIPT
 * Run this ONCE to populate all collections with proper schema
 * Usage: node seedDatabase.js (after updating firebaseConfig)
 */

import { collection, setDoc, doc } from "firebase/firestore";
import { db } from "./firebaseConfig.js";

// ── SAMPLE DATA ──────────────────────────────────────────────────────

const sampleUsers = [
  {
    id: "ben_arthur",
    displayName: "Ben Arthur",
    secretCode: "GGO2026",
    isAdmin: true,
    email: "ben@example.com",
  },
  {
    id: "jimmy",
    displayName: "Jimmy",
    secretCode: "GGO2026",
    isAdmin: false,
    email: "jimmy@example.com",
  },
  {
    id: "jane",
    displayName: "Jane",
    secretCode: "GGO2026",
    isAdmin: false,
    email: "jane@example.com",
  },
  {
    id: "selene",
    displayName: "Selene",
    secretCode: "GGO2026",
    isAdmin: false,
    email: "selene@example.com",
  },
];

// REAL WORLD CUP 2026 DATA - AUTO-GENERATED FROM worldcup.json
const sampleFixtures = [
  {
    matchId: "mexico_southafrica_2026-06-11",
    round: "Matchday 1",
    date: "2026-06-11",
    time: "13:00 UTC-6",
    team1: "Mexico",
    team2: "South Africa",
    group: "Group A",
    ground: "Mexico City",
    status: "scheduled",
  },
  {
    matchId: "southkorea_czechrepublic_2026-06-11",
    round: "Matchday 1",
    date: "2026-06-11",
    time: "20:00 UTC-6",
    team1: "South Korea",
    team2: "Czech Republic",
    group: "Group A",
    ground: "Guadalajara (Zapopan)",
    status: "scheduled",
  },
  {
    matchId: "canada_bosniaherzegoviana_2026-06-12",
    round: "Matchday 2",
    date: "2026-06-12",
    time: "15:00 UTC-4",
    team1: "Canada",
    team2: "Bosnia & Herzegovina",
    group: "Group B",
    ground: "Toronto",
    status: "scheduled",
  },
  {
    matchId: "qatar_switzerland_2026-06-13",
    round: "Matchday 3",
    date: "2026-06-13",
    time: "12:00 UTC-7",
    team1: "Qatar",
    team2: "Switzerland",
    group: "Group B",
    ground: "San Francisco Bay Area (Santa Clara)",
    status: "scheduled",
  },
];

const sampleResults = [
  {
    matchId: "m1",
    score1: null,
    score2: null,
    status: "scheduled",
    lastUpdate: new Date(),
  },
  {
    matchId: "m2",
    score1: null,
    score2: null,
    status: "scheduled",
    lastUpdate: new Date(),
  },
  {
    matchId: "m3",
    score1: null,
    score2: null,
    status: "scheduled",
    lastUpdate: new Date(),
  },
  {
    matchId: "m4",
    score1: null,
    score2: null,
    status: "scheduled",
    lastUpdate: new Date(),
  },
];

// ── SEED FUNCTIONS ───────────────────────────────────────────────────

async function seedCollection(collectionName, documents, idField = "id") {
  console.log(`\n🌱 Seeding ${collectionName}...`);
  try {
    for (const document of documents) {
      const docId = document[idField];
      const docData = { ...document };
      delete docData[idField]; // Remove ID field from data

      await setDoc(doc(db, collectionName, docId), docData);
      console.log(`  ✅ Added: ${docId}`);
    }
    console.log(`✓ ${collectionName} seeding complete\n`);
  } catch (error) {
    console.error(`❌ Error seeding ${collectionName}:`, error);
  }
}

async function seedAll() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  🚀 FIRESTORE DATABASE SEEDING STARTED");
  console.log("═══════════════════════════════════════════════");

  try {
    // Seed users
    await seedCollection("users", sampleUsers, "id");

    // Seed fixtures
    await seedCollection("fixtures", sampleFixtures, "matchId");

    // Seed results
    await seedCollection("results", sampleResults, "matchId");

    // Seed predictions (empty initially, but create collection)
    console.log("\n🌱 Creating predictions collection...");
    console.log("  (Empty - will populate as users make predictions)");

    // Seed leaderboard (empty initially)
    console.log("\n🌱 Creating leaderboard collection...");
    console.log("  (Empty - will populate as matches are scored)");

    console.log("\n═══════════════════════════════════════════════");
    console.log("  ✅ SEEDING COMPLETE!");
    console.log("═══════════════════════════════════════════════\n");

    console.log("📊 Collections created:");
    console.log("  ✓ users (4 test users)");
    console.log("  ✓ fixtures (4 sample matches)");
    console.log("  ✓ results (4 sample results)");
    console.log("  ✓ predictions (ready for player input)");
    console.log("  ✓ leaderboard (ready for scoring)");

    console.log("\n🔑 Test Credentials:");
    sampleUsers.forEach((user) => {
      console.log(`  • ${user.displayName}: username=${user.id}, code=${user.secretCode}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("\n❌ FATAL ERROR:", error);
    process.exit(1);
  }
}

// Run seeding
seedAll();
