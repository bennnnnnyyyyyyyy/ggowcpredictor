import { readFileSync } from "fs";
const vars = {};
readFileSync(".dev.vars", "utf-8").split("\n").forEach((line) => {
  const m = line.match(/^(\w+)=["']?(.*?)["']?\s*$/);
  if (m) vars[m[1]] = m[2];
});
const url = vars.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/predictions?select=*&limit=2";
const res = await fetch(url, {
  headers: { apikey: vars.SUPABASE_KEY, Authorization: "Bearer " + vars.SUPABASE_KEY },
});
const data = await res.json();
console.log("Columns:", Object.keys(data[0] || {}).join(", "));
console.log("Sample:", JSON.stringify(data[0], null, 2));
