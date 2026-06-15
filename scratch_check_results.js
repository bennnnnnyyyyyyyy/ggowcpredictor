const url = "https://nthnysznieivbkncpqrk.supabase.co";
const key = "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo";

async function run() {
  try {
    const res = await fetch(`${url}/rest/v1/results?select=*`, {
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
    console.log(`Total results in Supabase: ${data.length}`);
    const statuses = {};
    const finalMatches = [];
    for (const r of data) {
      statuses[r.status] = (statuses[r.status] || 0) + 1;
      if (["FT", "AET", "PEN", "COMPLETED", "FINAL"].includes(String(r.status).toUpperCase())) {
        finalMatches.push(r);
      }
    }
    console.log("Status distribution:", statuses);
    console.log(`Completed matches count: ${finalMatches.length}`);
    if (finalMatches.length > 0) {
      console.log("Completed matches sample:", JSON.stringify(finalMatches.slice(0, 5), null, 2));
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

run();
