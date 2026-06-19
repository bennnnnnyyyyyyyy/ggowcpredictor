/**
 * Legacy game helpers.
 *
 * Official group standings come from STATE.groupStandings, which is hydrated
 * from Supabase group_standings. This file intentionally does not calculate
 * points, goal difference, positions, or knockout qualifiers from predictions.
 */

function getOfficialGroupStandings() {
  return STATE.groupStandings || {};
}

function renderGroupStandings() {
  const container = document.getElementById("group-standings");
  if (!container) return;

  const groups = getOfficialGroupStandings();
  if (!Object.keys(groups).length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Official group tables are not synced yet.</p>
      </div>`;
    return;
  }

  container.innerHTML = Object.entries(groups)
    .map(
      ([groupName, rows]) => `
      <div class="group-table">
        <h3>${groupName}</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            ${rows
        .map(
          (row) => `
              <tr class="position-${row.position}">
                <td>${row.position}</td>
                <td class="team-name">${row.team_name}</td>
                <td>${row.played}</td>
                <td>${row.won}</td>
                <td>${row.drawn}</td>
                <td>${row.lost}</td>
                <td>${row.goal_difference > 0 ? "+" : ""}${row.goal_difference}</td>
                <td class="points"><strong>${row.points}</strong></td>
              </tr>
            `,
        )
        .join("")}
          </tbody>
        </table>
      </div>
    `,
    )
    .join("");
}

function renderKnockoutBracket() {
  const container = document.getElementById("knockout-bracket");
  if (!container) return;

  const groups = getOfficialGroupStandings();
  const qualifiers = Object.entries(groups).map(([groupName, rows]) => ({
    group: groupName,
    first: rows.find((row) => row.position === 1)?.team_name || "TBD",
    second: rows.find((row) => row.position === 2)?.team_name || "TBD",
  }));

  let html = `
    <div class="bracket-container">
      <div class="bracket-round">
        <h4>Round of 16</h4>
  `;

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
