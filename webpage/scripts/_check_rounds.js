import { readFileSync } from "fs";

const vars = {};
readFileSync(".dev.vars", "utf-8").split("\n").forEach((line) => {
  const m = line.match(/^(\w+)=["']?(.*?)["']?\s*$/);
  if (m) vars[m[1]] = m[2];
});

const url = vars.SUPABASE_URL.replace(/\/$/, "");
const key = vars.SUPABASE_KEY;

async function check() {
  const fRes = await fetch(url + '/rest/v1/fixtures?stage=neq.group', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  const data = await fRes.json();
  const rounds = [...new Set(data.map(f => f.round))];
  console.log('ROUNDS IN DB:', rounds);
  console.log('SAMPLE KNOCKOUT:', data.slice(0, 5).map(f => ({ matchId: f.matchId, round: f.round })));
}

check();
