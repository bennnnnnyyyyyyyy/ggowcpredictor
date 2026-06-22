

const url = "https://nthnysznieivbkncpqrk.supabase.co";
const key = "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo";

function scoreMatch(p1, p2, a1, a2) {
  if (p1 === a1 && p2 === a2) return 15;
  const predOutcome = Math.sign(p1 - p2);
  const actualOutcome = Math.sign(a1 - a2);
  if (predOutcome === actualOutcome) {
    const diffGap = Math.abs(p1 - p2 - (a1 - a2));
    return diffGap <= 1 ? 8 : 5;
  }
  return 0;
}

const FINAL_STATUSES = ["FT", "AET", "PEN", "COMPLETED", "FINAL"];

async function run() {
  try {
    // 1. Fetch predictions
    const predRes = await fetch(`${url}/rest/v1/predictions?username=eq.ray.parker&select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const predictions = await predRes.json();
    console.log(`Ray Parker has ${predictions.length} predictions in Supabase.`);

    // 2. Fetch results
    const resultsRes = await fetch(`${url}/rest/v1/results?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const results = await resultsRes.json();
    console.log(`Supabase has ${results.length} total results.`);

    // Index results by matchId
    const resultMap = {};
    for (const r of results) {
      const matchId = String(r.matchId || r.id || "").replace(/^match_/, "");
      if (FINAL_STATUSES.includes(String(r.status || "").toUpperCase())) {
        resultMap[matchId] = r;
      }
    }

    let calculatedPoints = 0;
    let exactScores = 0;
    let correctOutcomes = 0;
    let scoredMatches = 0;

    const auditList = [];

    for (const p of predictions) {
      const matchId = String(p.matchId || "").replace(/^match_/, "");
      const res = resultMap[matchId];
      if (!res) continue;

      const p1 = p.pred1;
      const p2 = p.pred2;
      const a1 = res.score1;
      const a2 = res.score2;

      const pts = scoreMatch(p1, p2, a1, a2);
      calculatedPoints += pts;
      scoredMatches++;
      if (pts === 15) exactScores++;
      if (pts > 0) correctOutcomes++;

      auditList.push({
        matchId,
        pred: `${p1}-${p2}`,
        actual: `${a1}-${a2}`,
        points: pts,
        status: res.status
      });
    }

    console.log(`Recalculated Leaderboard stats for Ray Parker based on Supabase raw tables:`);
    console.log(`Points: ${calculatedPoints}`);
    console.log(`Exact Scores: ${exactScores}`);
    console.log(`Correct Outcomes: ${correctOutcomes}`);
    console.log(`Scored matches: ${scoredMatches}`);
    console.log(`Detailed audit (last 10 scored):`);
    console.log(JSON.stringify(auditList.slice(-10), null, 2));

  } catch (e) {
    console.error("Error:", e);
  }
}

run();
