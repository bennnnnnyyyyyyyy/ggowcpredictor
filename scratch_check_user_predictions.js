const url = "https://nthnysznieivbkncpqrk.supabase.co";
const key = "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo";

async function run() {
  try {
    const username = "william.white";
    
    // Fetch predictions, results, and fixtures
    const [predsRes, resultsRes, fixturesRes] = await Promise.all([
      fetch(`${url}/rest/v1/predictions?username=eq.${username}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      }),
      fetch(`${url}/rest/v1/results`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      }),
      fetch(`${url}/rest/v1/fixtures`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      })
    ]);

    const preds = await predsRes.json();
    const results = await resultsRes.json();
    const fixtures = await fixturesRes.json();

    const fixtureMap = {};
    for (const f of fixtures) {
      fixtureMap[f.matchId] = f;
    }

    const resultMap = {};
    for (const r of results) {
      if (["FT", "AET", "PEN", "COMPLETED", "FINAL"].includes(String(r.status).toUpperCase())) {
        resultMap[r.matchId] = r;
      }
    }

    function calcPoints(p1, p2, a1, a2) {
      if (p1 === a1 && p2 === a2) return 15;
      const po = Math.sign(p1 - p2);
      const ao = Math.sign(a1 - a2);
      if (po === ao) return Math.abs(p1 - p2 - (a1 - a2)) <= 1 ? 8 : 5;
      return 0;
    }

    console.log(`User predictions fetched: ${preds.length}`);
    
    let totalPoints = 0;
    let exactScores = 0;
    let correctOutcomes = 0;
    let scored = 0;
    let predicted = 0;

    const computedList = preds.map(p => {
      const matchId = String(p.matchId).replace(/^match_/, "");
      const res = resultMap[matchId];
      const hasPred = p.pred1 !== null && p.pred2 !== null;
      if (hasPred) predicted++;

      let points = null;
      if (hasPred && res) {
        points = calcPoints(p.pred1, p.pred2, res.score1, res.score2);
        totalPoints += points;
        scored++;
        if (points === 15) exactScores++;
        if (points > 0) correctOutcomes++;
      }

      return {
        matchId,
        pred: hasPred ? `${p.pred1}-${p.pred2}` : null,
        result: res ? `${res.score1}-${res.score2}` : null,
        points
      };
    });

    console.log(`\nComputed locally for ${username}:`);
    console.log(`predicted (made): ${predicted}`);
    console.log(`scored (resolved predictions): ${scored}`);
    console.log(`totalPoints: ${totalPoints}`);
    console.log(`exactScores: ${exactScores}`);
    console.log(`correctOutcomes: ${correctOutcomes}`);
    console.log(`Accuracy = Math.round((correctOutcomes / scored) * 100) = ${scored > 0 ? Math.round((correctOutcomes / scored) * 100) : 0}%`);

    // Fetch the leaderboard row for this user
    const lbRes = await fetch(`${url}/rest/v1/leaderboard?username=eq.${username}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const lbData = await lbRes.json();
    console.log(`\nSupabase Leaderboard row for ${username}:`);
    console.log(JSON.stringify(lbData[0], null, 2));

  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

run();
