const url = "https://nthnysznieivbkncpqrk.supabase.co";
const key = "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo";

async function run() {
  try {
    const res = await fetch(`${url}/rest/v1/leaderboard?select=username,rank,totalPoints,exactScores,correctOutcomes,predicted,scored,updatedAt&order=rank.asc`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });
    if (!res.ok) {
      console.log(`❌ Error: HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    console.log("Supabase Leaderboard Table:");
    console.table(data);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

run();
