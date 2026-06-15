import { readFileSync } from "fs";

const vars = {};
readFileSync(".dev.vars", "utf-8").split("\n").forEach((line) => {
  const m = line.match(/^(\w+)=["']?(.*?)["']?\s*$/);
  if (m) vars[m[1]] = m[2];
});

const url = vars.SUPABASE_URL.replace(/\/$/, "");
const key = vars.SUPABASE_KEY;

async function check() {
  const rRes = await fetch(url + '/rest/v1/results?select=*', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  const results = await rRes.json();
  const fRes = await fetch(url + '/rest/v1/fixtures?select=*', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  const fixtures = await fRes.json();

  const fixtureMap = new Map();
  fixtures.forEach(f => fixtureMap.set(String(f.matchId), f));

  const mismatches = [];
  results.forEach(r => {
    const f = fixtureMap.get(String(r.matchId));
    if (f) {
      console.log(`Match ${r.matchId}: ${f.team1} vs ${f.team2} - Result: ${r.score1}-${r.score2} (${r.status})`);
    } else {
      console.log(`Result with unknown Match ID ${r.matchId}`);
    }
  });
}

check();
