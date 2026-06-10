/**
 * GAME LOGIC - Score predictions, group standings, knockout bracket
 */

// ── GROUP STANDINGS CALCULATOR ───────────────────────────────────────
class GroupStandings {
  constructor(groupName, teams) {
    this.groupName = groupName;
    this.standings = teams.map((team) => ({
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0, // goals for
      ga: 0, // goals against
      gd: 0, // goal difference
      points: 0,
    }));
  }

  addMatch(team1, team2, score1, score2) {
    const t1 = this.standings.find((t) => t.team === team1);
    const t2 = this.standings.find((t) => t.team === team2);

    if (!t1 || !t2) return;

    t1.played++;
    t2.played++;
    t1.gf += score1;
    t1.ga += score2;
    t2.gf += score2;
    t2.ga += score1;

    if (score1 > score2) {
      t1.won++;
      t1.points += 3;
      t2.lost++;
    } else if (score2 > score1) {
      t2.won++;
      t2.points += 3;
      t1.lost++;
    } else {
      t1.drawn++;
      t1.points += 1;
      t2.drawn++;
      t2.points += 1;
    }

    t1.gd = t1.gf - t1.ga;
    t2.gd = t2.gf - t2.ga;
  }

  getStandings() {
    return this.standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    });
  }
}

// ── GROUP DATA ───────────────────────────────────────────────────────
const GROUPS = {
  "Group A": ["Mexico", "South Africa", "South Korea", "Czech Republic"],
  "Group B": ["Canada", "Bosnia & Herzegovina", "Qatar", "Switzerland"],
  "Group C": ["Brazil", "Morocco", "Haiti", "Scotland"],
  "Group D": ["USA", "Paraguay", "Australia", "Turkey"],
  "Group E": ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
  "Group F": ["Netherlands", "Morocco", "Senegal", "Tunisia"], // Example
  "Group G": ["Belgium", "Croatia", "France", "Portugal"], // Example
  "Group H": ["Italy", "Spain", "Germany", "Poland"], // Example
};

// ── PREDICTION CARD HANDLER ──────────────────────────────────────────
async function handlePredictionInput(matchId, teamNumber) {
  const input = document.querySelector(
    `[data-matchid="${matchId}"][data-team="${teamNumber}"]`
  );
  if (!input) return;

  const pred1Input = document.querySelector(
    `[data-matchid="${matchId}"][data-team="1"]`
  );
  const pred2Input = document.querySelector(
    `[data-matchid="${matchId}"][data-team="2"]`
  );

  const pred1 = parseInt(pred1Input?.value) || 0;
  const pred2 = parseInt(pred2Input?.value) || 0;

  await savePrediction(matchId, pred1, pred2);

  // Re-render group standings since this prediction changed
  renderGroupStandings();
}

// ── MATCH CARDS RENDERER ─────────────────────────────────────────────
function renderMatchCards(containerId, fixtures, filterFn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const filtered = fixtures.filter(filterFn);
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏟️</div>
        <p>No matches in this category</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (match) => {
        const pred = STATE.predictions[match.matchId] || {};
        const pred1 = pred.pred1 !== undefined ? pred.pred1 : "";
        const pred2 = pred.pred2 !== undefined ? pred.pred2 : "";
        const matchDate = new Date(match.date);
        const now = new Date();
        const isLocked = matchDate < now;

        return `
      <div class="match-card" data-matchid="${match.matchId}">
        <div class="match-header">
          <div class="match-date">${matchDate.toLocaleDateString()} ${match.time || ""}</div>
          <div class="match-ground">${match.ground || "TBD"}</div>
        </div>
        
        <div class="match-teams">
          <div class="team team1">
            <div class="team-name">${match.team1}</div>
            <input 
              type="number" 
              class="score-input" 
              data-matchid="${match.matchId}" 
              data-team="1"
              value="${pred1}" 
              min="0" 
              max="9"
              ${isLocked ? "disabled" : ""}
              onchange="handlePredictionInput('${match.matchId}', 1)"
              placeholder="0"
            />
          </div>
          
          <div class="vs">VS</div>
          
          <div class="team team2">
            <div class="team-name">${match.team2}</div>
            <input 
              type="number" 
              class="score-input" 
              data-matchid="${match.matchId}" 
              data-team="2"
              value="${pred2}" 
              min="0" 
              max="9"
              ${isLocked ? "disabled" : ""}
              onchange="handlePredictionInput('${match.matchId}', 2)"
              placeholder="0"
            />
          </div>
        </div>
        
        ${
          isLocked
            ? `<div class="match-locked">🔒 Match locked</div>`
            : `<div class="match-time-left">${getTimeRemaining(matchDate)}</div>`
        }
      </div>
    `;
      }
    )
    .join("");
}

function getTimeRemaining(matchDate) {
  const now = new Date();
  const diff = matchDate - now;

  if (diff < 0) return "Started";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ── GROUP STANDINGS RENDERER ─────────────────────────────────────────
function renderGroupStandings() {
  const container = document.getElementById("group-standings");
  if (!container) return;

  let html = "";

  for (const [groupName, teams] of Object.entries(GROUPS)) {
    const standings = new GroupStandings(groupName, teams);

    // Find all matches for this group
    const groupMatches = STATE.fixtures.filter(
      (m) => m.group === groupName && STATE.predictions[m.matchId]
    );

    groupMatches.forEach((match) => {
      const pred = STATE.predictions[match.matchId];
      standings.addMatch(match.team1, match.team2, pred.pred1, pred.pred2);
    });

    const table = standings.getStandings();

    html += `
      <div class="group-table">
        <h3>${groupName}</h3>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GF</th>
              <th>GA</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            ${table
              .map(
                (row, idx) => `
              <tr class="position-${idx + 1}">
                <td class="team-name">${idx + 1}. ${row.team}</td>
                <td>${row.played}</td>
                <td>${row.won}</td>
                <td>${row.drawn}</td>
                <td>${row.lost}</td>
                <td>${row.gf}</td>
                <td>${row.ga}</td>
                <td>${row.gd > 0 ? "+" : ""}${row.gd}</td>
                <td class="points"><strong>${row.points}</strong></td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ── KNOCKOUT BRACKET ─────────────────────────────────────────────────
function renderKnockoutBracket() {
  const container = document.getElementById("knockout-bracket");
  if (!container) return;

  // Get qualified teams from groups
  const qualifiers = [];
  for (const [groupName, teams] of Object.entries(GROUPS)) {
    const standings = new GroupStandings(groupName, teams);

    const groupMatches = STATE.fixtures.filter(
      (m) => m.group === groupName && STATE.predictions[m.matchId]
    );

    groupMatches.forEach((match) => {
      const pred = STATE.predictions[match.matchId];
      standings.addMatch(match.team1, match.team2, pred.pred1, pred.pred2);
    });

    const table = standings.getStandings();
    qualifiers.push({
      group: groupName,
      first: table[0]?.team || "TBD",
      second: table[1]?.team || "TBD",
    });
  }

  let html = `
    <div class="bracket-container">
      <div class="bracket-round">
        <h4>Round of 16</h4>
  `;

  // Show matchups (1st of Group A vs 2nd of Group B, etc.)
  for (let i = 0; i < qualifiers.length; i += 2) {
    const g1 = qualifiers[i];
    const g2 = qualifiers[i + 1];
    if (!g2) break;

    html += `
      <div class="bracket-match">
        <div class="team">${g1.first}</div>
        <div class="vs">vs</div>
        <div class="team">${g2.second}</div>
      </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
}
