const url = "https://nthnysznieivbkncpqrk.supabase.co";
const key = "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo";

async function run() {
  try {
    const res = await fetch(`${url}/rest/v1/predictions?select=id`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: "1000-1999"
      }
    });
    if (!res.ok) {
      console.log(`Error: HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    console.log(`Range 1000-1999 returned ${data.length} predictions.`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

run();
