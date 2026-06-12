// Updates every user's secretCode in Firestore and writes user-passwords.csv
// Run with: node scripts/updatePasswords.js

import https from "https";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = "ggowcpredictor";
const API_KEY = "AIzaSyAVBLnjdM4cV9vBwV27dl6bEc4ZqVjuFBw";
const BASE = `firestore.googleapis.com`;

// Same deterministic password generator used earlier
const words = [
  "Fox","Star","Wolf","Hawk","Lion","Bear","Ace","Bolt",
  "Gem","Ice","Jet","Oak","Ray","Sky","Sun","Top",
  "Arc","Bay","Cap","Dew","Elm","Fern","Glen","Hue",
  "Ink","Jay","Key","Lark","Moss","Nile","Orb","Peak",
  "Quill","Reef","Sage","Tide","Urn","Vale","Wren","Zinc",
  "Apex","Blaze","Crest","Dawn","Edge","Frost","Gust","Haze",
  "Isle","Jade","Knot","Lune","Mist","Nord","Opal","Pyre",
  "Rush","Snow",
];

function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const rand = seededRand(20260611);
const usedCodes = new Set();
function genCode() {
  while (true) {
    const word = words[Math.floor(rand() * words.length)];
    const num = String(Math.floor(rand() * 900) + 100);
    const code = word + num;
    if (!usedCodes.has(code)) { usedCodes.add(code); return code; }
  }
}

const users = [
  { name: "Ben Arthur",        username: "ben_arthur" },
  { name: "Jimmy",             username: "jimmy" },
  { name: "Jane",              username: "jane" },
  { name: "Selene",            username: "selene" },
  { name: "Katherine Adams",   username: "katherine.adams" },
  { name: "Sam Richards",      username: "sam.richards" },
  { name: "Anna Nelson",       username: "anna.nelson" },
  { name: "Steven Adams",      username: "steven.adams" },
  { name: "Steve Winchester",  username: "steve.winchester" },
  { name: "Celine Dami",       username: "celine.dami" },
  { name: "Monika Miller",     username: "monika.miller" },
  { name: "Heaven Davis",      username: "heaven.davis" },
  { name: "Maddy Snow",        username: "maddy.snow" },
  { name: "Blake Hunter",      username: "blake.hunter" },
  { name: "Jules Brown",       username: "jules.brown" },
  { name: "Mary Smith",        username: "mary.miller" },
  { name: "Ben Kamel",         username: "ben.camel" },
  { name: "Liz Fox",           username: "lizfoxwiz97" },
  { name: "Michael Morgan",    username: "michael.morgan" },
  { name: "Bella Cameron",     username: "bella.cameron" },
  { name: "Oscar Kamel",       username: "oscar.kamel" },
  { name: "Marcy Miller",      username: "marcy.miller" },
  { name: "Demon Smith",       username: "demon.smith" },
  { name: "Ivy Bennett",       username: "ivy.bennett" },
  { name: "David Green",       username: "david.green" },
  { name: "Haley Roberson",    username: "haley.roberson" },
  { name: "Donna Bell",        username: "donna.bell" },
  { name: "Laura Miller",      username: "laura.miller" },
  { name: "Luke Grant",        username: "luke.grant" },
  { name: "Riley Miller",      username: "riley.miller" },
  { name: "Stewart Martin",    username: "stewart.martin" },
  { name: "Jessie Moore",      username: "jessie.moore" },
  { name: "Grace Smith",       username: "grace.smith" },
  { name: "Josh Adams",        username: "josh.adams" },
  { name: "Natalie Wilson",    username: "natalie.wilson" },
  { name: "Roben Neves",       username: "roben.neves" },
  { name: "Mia Cooper",        username: "mia.cooper" },
  { name: "Dexter Lane",       username: "dexter.lane" },
  { name: "Leon Smith",        username: "leon.smith" },
  { name: "Jane White",        username: "jane.white" },
  { name: "Brodie Armin",      username: "brodie.armin" },
  { name: "Lori Anderson",     username: "lori.anderson" },
  { name: "Olivia Black",      username: "olivia.black" },
  { name: "Iris Brown",        username: "iris.brown" },
  { name: "Tony Smith",        username: "tonny.smith" },
  { name: "Adam White",        username: "adam.white" },
  { name: "Daisy Parker",      username: "daisy.parker" },
  { name: "Phoebe Brown",      username: "phoebe.brown" },
  { name: "Melanie Brown",     username: "melanie.brown" },
  { name: "Jeremy Wilson",     username: "jeremy.welson" },
  { name: "Frank Clarkson",    username: "frank.clarkson" },
  { name: "Rick Nelson",       username: "rickk.nelson" },
  { name: "Rose Simon",        username: "rose.simon" },
  { name: "Alex Woods",        username: "alex.woods" },
  { name: "Nora Atkins",       username: "nora.atkins" },
  { name: "Nova Grace",        username: "nova.grace" },
  { name: "Hope Smith",        username: "hope.smith" },
  { name: "Caroline Richards", username: "caroline.richards" },
  { name: "Jasmine Green",     username: "jasmine.green" },
  { name: "Tim Miller",        username: "tim.miller" },
  { name: "Coby Jones",        username: "cobe.jones" },
  { name: "Ray Parker",        username: "ray.parker" },
];

const withPasswords = users.map(u => ({ ...u, code: genCode() }));

function patchUser(username, code) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      fields: { secretCode: { stringValue: code } }
    });
    const options = {
      hostname: BASE,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(username)}?updateMask.fieldPaths=secretCode&key=${API_KEY}`,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve({ username, ok: true });
        } else {
          resolve({ username, ok: false, status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`Updating ${withPasswords.length} users in Firestore...\n`);

  let ok = 0, fail = 0;
  for (const user of withPasswords) {
    const result = await patchUser(user.username, user.code);
    if (result.ok) {
      console.log(`  ✓ ${user.username}`);
      ok++;
    } else {
      console.log(`  ✗ ${user.username} — HTTP ${result.status}: ${result.body}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} updated, ${fail} failed.`);

  // Write CSV
  const csvPath = path.join(__dirname, "..", "user-passwords.csv");
  const csvLines = ["name,username,password", ...withPasswords.map(u => `${u.name},${u.username},${u.code}`)];
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n");
  console.log(`\nCSV written to: ${csvPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
