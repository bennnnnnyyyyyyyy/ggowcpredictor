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

const emailList = [
  "jana.cooper.wiz@gmail.com",
  "katherine.adams.wiz@gmail.com",
  "sam.richards.wiz@gmail.com",
  "anna.nelson.wiz@gmail.com",
  "steven.adams.wiz@gmail.com",
  "STEVE.WINCHESTER.WIZ@gmail.com",
  "celine.dami.wiz@gmail.com",
  "monika.miller.wiz@gmail.com",
  "HEAVEN.DAVIS.WIZ@gmail.com",
  "maddy.snow.wiz@gmail.com",
  "blake.hunter.wiz@gmail.com",
  "jules.brown.wiz@gmail.com",
  "mary.miller.wiz@gmail.com",
  "ben.camel.wiz@gmail.com",
  "lizfoxwiz97@gmail.com",
  "michael.morgan.wiz@gmail.com",
  "bella.cameron.wiz@gmail.com",
  "oscar.kamel.wiz@gmail.com",
  "marcy.miller.wiz@gmail.com",
  "demon.smith.wiz@gmail.com",
  "ivy.bennett.wiz@gmail.com",
  "david.green.wiz@gmail.com",
  "haley.roberson.wiz@gmail.com",
  "donna.bell.wiz@gmail.com",
  "laura.miller.wiz@gmail.com",
  "luke.grant.wiz@gmail.com",
  "riley.miller.wiz@gmail.com",
  "stewart.martin.wiz@gmail.com",
  "jessie.moore.wiz@gmail.com",
  "grace.smith.wiz@gmail.com",
  "josh.adams.wiz@gmail.com",
  "natalie.wilson.wiz@gmail.com",
  "roben.neves.wiz@gmail.com",
  "mia.cooper.wiz@gmail.com",
  "dexter.lane.wiz@gmail.com",
  "leon.smith.wiz@gmail.com",
  "jane.white.wizz@gmail.com",
  "brodie.armin.wiz@gmail.com",
  "lori.anderson.wiz@gmail.com",
  "olivia.black.wiz@gmail.com",
  "iris.brown.wiz@gmail.com",
  "tonny.smith.wiz@gmail.com",
  "adam.white.wiz@gmail.com",
  "daisy.parker.wiz@gmail.com",
  "phoebe.brown.wiz@gmail.com",
  "melanie.brown.wiz@gmail.com",
  "jeremy.welson.wiz@gmail.com",
  "frank.clarkson.wiz@gmail.com",
  "rickk.nelson.wiz@gmail.com",
  "rose.simon.wiz@gmail.com",
  "alex.woods.wiz@gmail.com",
  "nora.atkins.wiz@gmail.com",
  "nova.grace.wiz@gmail.com",
  "hope.smith.wiz@gmail.com",
  "caroline.richards.wiz@gmail.com",
  "jasmine.green.wiz@gmail.com",
  "tim.miller.wiz@gmail.com",
  "cobe.jones.wiz@gmail.com",
  "ray.parker.wiz@gmail.com",
  "eva.christian.wiz@gmail.com",
  "john.williams.wiz@gmail.com",
  "norman.clarke.wiz@gmail.com",
  "jason.foster.wiz@gmail.com",
  "matt.walter.wiz@gmail.com",
  "jasmine.arthur.wiz@gmail.com",
  "ashly.murphy.wiz@gmail.com",
  "joey.milner.wiz@gmail.com",
  "jordan.kelly00.wiz@gmail.com",
  "mavis.miller.wiz@gmail.com",
  "jack.ethann.wiz@gmail.com",
  "andrew.cooper.wiz@gmail.com",
  "peter.smith.wiz@gmail.com",
  "grant.holden.wiz@gmail.com",
  "chris.johnson.wiz@gmail.com",
  "mike.woods.wiz@gmail.com",
  "ianstraange@gmail.com",
  "joseph.brown.wiz@gmail.com",
  "karenjacksonwiz@gmail.com",
  "thomas.smith.wiz@gmail.com",
  "hazel.white.wiz@gmail.com",
  "russ.dami.wiz@gmail.com",
  "william.white.wiz@gmail.com",
  "ben.arthur.wiz@gmail.com",
  "jimmy.pearson.wiz@gmail.com",
  "selene.myles.wiz@gmail.com",
  "kaity.james.wiz@gmail.com"
];

function getEmailForUsername(username) {
  const norm = username.toLowerCase().replace(/_/g, ".");
  const custom = {
    "jane": "jana.cooper.wiz@gmail.com",
    "jimmy": "jimmy.pearson.wiz@gmail.com",
    "selene": "selene.myles.wiz@gmail.com",
    "ashley.murphy": "ashly.murphy.wiz@gmail.com",
    "ian.strange": "ianstraange@gmail.com",
    "jack.ethan": "jack.ethann.wiz@gmail.com",
    "jordan.kelly": "jordan.kelly00.wiz@gmail.com",
    "karen.jackson": "karenjacksonwiz@gmail.com",
    "jane.white": "jane.white.wizz@gmail.com"
  };
  
  if (custom[norm]) return custom[norm];
  
  const match = emailList.find(email => {
    const prefix = email.split("@")[0].toLowerCase();
    return prefix === norm || prefix === norm + ".wiz";
  });
  
  if (match) return match;
  return `${norm}.wiz@gmail.com`;
}

function fetchUsers() {
  return new Promise((resolve, reject) => {
    const url = `https://${BASE}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?pageSize=300&key=${API_KEY}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.documents || []);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on("error", reject);
  });
}

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
  console.log("Fetching all users from Firestore...");
  let docs = [];
  try {
    docs = await fetchUsers();
  } catch (err) {
    console.error("Failed to fetch users from Firestore:", err);
    process.exit(1);
  }

  const users = docs.map(doc => {
    const parts = doc.name.split("/");
    const username = parts[parts.length - 1];
    const displayName = doc.fields.displayName ? doc.fields.displayName.stringValue : username;
    const email = getEmailForUsername(username);
    return { name: displayName, username, email };
  });

  // Sort alphabetically by username so password generation order is consistent
  users.sort((a, b) => a.username.localeCompare(b.username));

  const withPasswords = users.map(u => ({ ...u, code: genCode() }));

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

  // Write CSV (including name, username, email, password, excluding bruce.logan, george.saad and tom.walker)
  const csvPath = path.join(__dirname, "..", "user-passwords.csv");
  const csvLines = ["name,username,email,password", ...withPasswords.filter(u => u.username !== "bruce.logan" && u.username !== "george.saad" && u.username !== "tom.walker").map(u => `${u.name},${u.username},${u.email},${u.code}`)];
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n");
  console.log(`\nCSV written to: ${csvPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
