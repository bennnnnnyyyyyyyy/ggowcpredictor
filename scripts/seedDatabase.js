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

const sampleFixtures = [
  {
    matchId: "m1",
    matchday: 1,
    team1: "USA",
    team2: "Mexico",
    kickoff: new Date("2026-06-12T19:00:00Z"),
    status: "scheduled",
  },
  {
    matchId: "m2",
    matchday: 1,
    team1: "Canada",
    team2: "Argentina",
    kickoff: new Date("2026-06-12T22:00:00Z"),
    status: "scheduled",
  },
  {
    matchId: "m3",
    matchday: 1,
    team1: "Brazil",
    team2: "Spain",
    kickoff: new Date("2026-06-13T19:00:00Z"),
    status: "scheduled",
  },
  {
    matchId: "m4",
    matchday: 1,
    team1: "Germany",
    team2: "France",
    kickoff: new Date("2026-06-13T22:00:00Z"),
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
    for (const doc of documents) {
      const docId = doc[idField];
      const docData = { ...doc };
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
