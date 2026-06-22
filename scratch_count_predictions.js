const url = "https://nthnysznieivbkncpqrk.supabase.co";
const key = "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo";

async function run() {
  try {
    // Check total count by requesting count=exact header
    const res = await fetch(`${url}/rest/v1/predictions?select=id`, {
      method: "HEAD",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact"
      }
    });
    const count = res.headers.get("content-range");
    console.log(`Total predictions in Supabase (from header): ${count}`);

    // Let's also fetch without filters to see how many rows are returned by default select=*
    const res2 = await fetch(`${url}/rest/v1/predictions?select=id`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });
    const data = await res2.json();
    console.log(`Default fetch returned ${data.length} predictions.`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

run();
