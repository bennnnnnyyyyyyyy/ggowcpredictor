// GGO WC 2026 Predictor - browser app
// Uses Firestore when available, with local JSON/localStorage fallback for development.

const firebaseConfig = {
  apiKey: "AIzaSyAVBLnjdM4cV9vBwV27dl6bEc4ZqVjuFBw",
  authDomain: "ggowcpredictor.firebaseapp.com",
  projectId: "ggowcpredictor",
  storageBucket: "ggowcpredictor.firebasestorage.app",
  messagingSenderId: "126058028551",
  appId: "1:126058028551:web:e60b6e211c3e2e56e154a2",
  measurementId: "G-YQLEYQ386D",
};

const DEMO_USERS = {
  ben_arthur: { displayName: "Ben Arthur", isAdmin: true, code: "GGO2026" },
  jimmy: { displayName: "Jimmy", isAdmin: false, code: "GGO2026" },
  jane: { displayName: "Jane", isAdmin: false, code: "GGO2026" },
  selene: { displayName: "Selene", isAdmin: false, code: "GGO2026" },
};

let db = null;
let activeMatchFilter = "all";
let activeResultFilter = "all";

const SESSION = {
  token: sessionStorage.getItem("ggo_wc_token") || null,
  username: sessionStorage.getItem("ggo_wc_user") || null,
  displayName: sessionStorage.getItem("ggo_wc_displayname") || null,
  isAdmin: sessionStorage.getItem("ggo_wc_admin") === "true",
};

const CONFIG = {
  appsScriptUrl: localStorage.getItem("ggo_wc_url") || "",
  apiKey: localStorage.getItem("ggo_wc_key") || "",
};

const STATE = {
  fixtures: [],
  results: {},
  predictions: {},
  leaderboard: [],
  users: [],
  teams: {},
  lastSync: null,
};

const STADIUMS_BY_GROUND = {
  "Atlanta": { city: "Atlanta", stadium: "Mercedes-Benz Stadium" },
  "Boston": { city: "Foxborough", stadium: "Gillette Stadium" },
  "Dallas": { city: "Arlington", stadium: "AT&T Stadium" },
  "Guadalajara (Zapopan)": { city: "Zapopan", stadium: "Estadio Akron" },
  "Houston": { city: "Houston", stadium: "NRG Stadium" },
  "Kansas City": { city: "Kansas City", stadium: "Arrowhead Stadium" },
  "Los Angeles (Inglewood)": { city: "Inglewood", stadium: "SoFi Stadium" },
  "Mexico City": { city: "Mexico City", stadium: "Estadio Azteca" },
  "Miami": { city: "Miami Gardens", stadium: "Hard Rock Stadium" },
  "Monterrey (Guadalupe)": { city: "Guadalupe", stadium: "Estadio BBVA" },
  "New York New Jersey": { city: "East Rutherford", stadium: "MetLife Stadium" },
  "Philadelphia": { city: "Philadelphia", stadium: "Lincoln Financial Field" },
  "San Francisco Bay Area (Santa Clara)": { city: "Santa Clara", stadium: "Levi's Stadium" },
  "Seattle": { city: "Seattle", stadium: "Lumen Field" },
  "Toronto": { city: "Toronto", stadium: "BMO Field" },
  "Vancouver": { city: "Vancouver", stadium: "BC Place" },
};

window.addEventListener("DOMContentLoaded", async () => {
  initFirebase();
  await loadTeamMeta();
  await hydrateLoginUsers();

  if (SESSION.token && SESSION.username) {
    showApp();
  }

  window.setInterval(() => {
    if (document.hidden) return;
    if (document.getElementById("app")?.style.display !== "none") {
      renderPredictions();
      renderResults();
      renderGroupStandings();
    }
  }, 30000);
});

function initFirebase() {
  if (!window.firebase || !firebase.initializeApp || !firebase.firestore) {
    console.warn(
      "Firebase compat SDK not available. Using local fallback mode.",
    );
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase initialized");
  } catch (error) {
    console.warn(
      "Firebase init failed. Using local fallback mode.",
      error.message,
    );
  }
}

async function hydrateLoginUsers() {
  STATE.users = Object.entries(DEMO_USERS).map(([username, user]) => ({
    username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
  }));

  if (!db) return;

  try {
    const snap = await db.collection("users").get();
    if (!snap.empty) {
      STATE.users = snap.docs.map((doc) => ({
        username: doc.id,
        ...doc.data(),
      }));
    }
  } catch (error) {
    console.warn("Could not load Firestore users.", error.message);
  }
}

async function handleLogin(event) {
  if (event) event.preventDefault();

  const username = document.getElementById("login-name").value.trim();
  const code = document.getElementById("login-code").value.trim();
  const errEl = document.getElementById("login-error");

  if (!username || !code) {
    showLoginError("Please enter your username and secret code.");
    return;
  }

  try {
    let userData = null;

    if (db) {
      const userSnap = await db.collection("users").doc(username).get();
      if (userSnap.exists) userData = userSnap.data();
    }

    if (!userData && DEMO_USERS[username]) {
      userData = {
        displayName: DEMO_USERS[username].displayName,
        secretCode: DEMO_USERS[username].code,
        isAdmin: DEMO_USERS[username].isAdmin,
      };
    }

    if (!userData) {
      showLoginError("User not found. Ask the admin to add your username.");
      return;
    }

    if (String(userData.secretCode || "") !== code) {
      showLoginError("Invalid code. Try again.");
      return;
    }

    SESSION.token = btoa(`${username}:${Date.now()}`);
    SESSION.username = username;
    SESSION.displayName = userData.displayName || username;
    SESSION.isAdmin = Boolean(userData.isAdmin);

    sessionStorage.setItem("ggo_wc_token", SESSION.token);
    sessionStorage.setItem("ggo_wc_user", SESSION.username);
    sessionStorage.setItem("ggo_wc_displayname", SESSION.displayName);
    sessionStorage.setItem("ggo_wc_admin", String(SESSION.isAdmin));

    errEl.classList.remove("show");
    showApp();
  } catch (error) {
    console.error("Login error:", error);
    showLoginError("Login failed. Check your connection and try again.");
  }
}

function showLoginError(message) {
  const errEl = document.getElementById("login-error");
  errEl.textContent = message;
  errEl.classList.add("show");
}

function showApp() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display = "block";

  const initials = getInitials(SESSION.displayName || SESSION.username || "?");
  document.getElementById("user-avatar").textContent = initials;
  document.getElementById("user-display-name").textContent =
    SESSION.displayName || SESSION.username;

  if (
    SESSION.username &&
    !localStorage.getItem(`ggo_wc_rules_shown_${SESSION.username}`)
  ) {
    toggleRules(true);
  }

  requestSync();
}

function handleLogout() {
  sessionStorage.clear();
  window.location.reload();
}

function showView(id, btn) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.remove("active");
  });
  document.querySelectorAll(".nav-btn").forEach((navBtn) => {
    navBtn.classList.remove("active");
  });

  const view = document.getElementById(`view-${id}`);
  if (view) view.classList.add("active");
  if (btn) btn.classList.add("active");

  if (id === "results") renderResults();
  if (id === "bracket") renderBracket();
  if (id === "leaderboard") renderLeaderboard();
  if (id === "admin") renderAdmin();
}

async function requestSync() {
  const dot = document.getElementById("sync-dot");
  const timeEl = document.getElementById("last-sync-time");
  const syncBtn = document.querySelector(".sync-btn");

  if (dot) dot.className = "status-dot loading";
  if (timeEl) timeEl.textContent = "Syncing...";
  if (syncBtn) syncBtn.classList.add("loading");

  try {
    await loadGameData();
    if (!STATE.fixtures.length) await loadFixtures();
    if (!Object.keys(STATE.results).length) await loadResults();
    if (!STATE.leaderboard.length) await loadLeaderboard();
    await loadPredictions();

    STATE.lastSync = new Date();
    if (dot) dot.className = "status-dot active";
    if (timeEl) {
      timeEl.textContent = `Live - ${STATE.lastSync.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    renderPredictions();
    renderGroupStandings();
    renderLeaderboard();
    renderResults();
    renderBracket();
    renderAdmin();
  } catch (error) {
    console.error("Sync error:", error);
    if (dot) dot.className = "status-dot";
    if (timeEl) timeEl.textContent = "Sync failed";
  } finally {
    if (syncBtn) syncBtn.classList.remove("loading");
  }
}

async function loadFixtures() {
  let fixtures = [];

  const apiFixtures = await loadFixturesFromApi();
  if (apiFixtures.length) {
    STATE.fixtures = apiFixtures;
    return;
  }

  if (db) {
    try {
      const snap = await db.collection("fixtures").get();
      fixtures = snap.docs.map((doc) =>
        normalizeFixture({ id: doc.id, ...doc.data() }),
      );
    } catch (error) {
      console.warn("Could not load Firestore fixtures.", error.message);
    }
  }

  if (!fixtures.length) {
    fixtures = await loadLocalFixtures();
  }

  STATE.fixtures = fixtures.sort((a, b) => {
    const aTime = a.kickoffDate ? a.kickoffDate.getTime() : 0;
    const bTime = b.kickoffDate ? b.kickoffDate.getTime() : 0;
    return aTime - bTime || Number(a.matchId) - Number(b.matchId);
  });
}

async function loadLocalFixtures() {
  try {
    const response = await fetch("2026/worldcup.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (data.matches || []).map((match, index) =>
      normalizeFixture({
        ...match,
        matchId: match.num || index + 1,
      }),
    );
  } catch (error) {
    console.warn("Local fixture JSON unavailable.", error.message);
    return [];
  }
}

async function loadResults() {
  STATE.results = {};

  const apiResults = await loadResultsFromApi();
  if (Object.keys(apiResults).length) {
    STATE.results = apiResults;
    return;
  }

  if (db) {
    try {
      const snap = await db.collection("results").get();
      snap.docs.forEach((doc) => {
        const result = doc.data();
        const matchId = String(result.matchId || doc.id.replace(/^match_/, ""));
        STATE.results[matchId] = normalizeResult({
          id: doc.id,
          ...result,
          matchId,
        });
      });
    } catch (error) {
      console.warn("Could not load Firestore results.", error.message);
    }
  }

  const localResults = readLocalObject(
    `ggo_wc_results_${SESSION.username || "demo"}`,
  );
  STATE.results = { ...localResults, ...STATE.results };

  // Inject mock results for local development/testing if no database or API is connected
  if (!db && !CONFIG.appsScriptUrl && Object.keys(STATE.results).length === 0) {
    STATE.results = {
      "1": { matchId: "1", score1: 2, score2: 1, status: "FT" },
      "2": { matchId: "2", score1: 1, score2: 1, status: "1H" },
      "3": { matchId: "3", score1: 0, score2: 2, status: "FT" }
    };
  }
}

async function loadPredictions() {
  STATE.predictions = readLocalObject(
    `ggo_wc_predictions_${SESSION.username || "demo"}`,
  );

  if (!db || !SESSION.username) return;

  try {
    const snap = await db
      .collection("predictions")
      .where("username", "==", SESSION.username)
      .get();
    snap.docs.forEach((doc) => {
      const prediction = doc.data();
      STATE.predictions[String(prediction.matchId)] =
        normalizePrediction(prediction);
    });
  } catch (error) {
    console.warn("Could not load Firestore predictions.", error.message);
  }
}

async function loadLeaderboard() {
  STATE.leaderboard = [];

  const apiLeaderboard = await loadLeaderboardFromApi();
  if (apiLeaderboard.length) {
    STATE.leaderboard = apiLeaderboard;
    return;
  }

  if (db) {
    try {
      const current = await db.collection("leaderboard").doc("current").get();
      if (current.exists && Array.isArray(current.data().players)) {
        STATE.leaderboard = current.data().players;
        return;
      }
    } catch (error) {
      console.warn("Could not load Firestore leaderboard.", error.message);
    }
  }

  STATE.leaderboard = buildLocalLeaderboard();
}

function normalizeFixture(fixture) {
  const matchId = String(fixture.matchId || fixture.num || fixture.id || "");
  const kickoffDate = parseKickoff(
    fixture.date,
    fixture.time,
    fixture.kickoffUTC,
  );
  const stage = fixture.stage || getStageFromRound(fixture.round);

  return {
    ...fixture,
    matchId,
    group: fixture.group || stageLabel(stage),
    stage,
    kickoffUTC: kickoffDate
      ? kickoffDate.toISOString()
      : fixture.kickoffUTC || "",
    kickoffDate,
    team1: fixture.team1 || fixture.homeTeam || "TBD",
    team2: fixture.team2 || fixture.awayTeam || "TBD",
    ground: fixture.ground || fixture.venue || "TBD",
  };
}

function normalizePrediction(prediction) {
  return {
    ...prediction,
    matchId: String(prediction.matchId),
    pred1: Number(prediction.pred1),
    pred2: Number(prediction.pred2),
  };
}

function normalizeResult(result) {
  return {
    ...result,
    matchId: String(result.matchId),
    score1: nullableNumber(result.score1 ?? result.team1Score),
    score2: nullableNumber(result.score2 ?? result.team2Score),
    status: result.status || "NS",
  };
}

function showToast(message, type = "success") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 2500);
}

async function savePrediction(matchId, pred1, pred2) {
  const fixture = STATE.fixtures.find(
    (match) => match.matchId === String(matchId),
  );
  const score1 = Number(pred1);
  const score2 = Number(pred2);

  if (!fixture) return;

  if (isLocked(fixture)) {
    showToast("This match is locked.", "error");
    renderPredictions();
    return;
  }

  if (
    !Number.isInteger(score1) ||
    !Number.isInteger(score2) ||
    score1 < 0 ||
    score2 < 0
  ) {
    showToast("Please enter valid scores.", "error");
    return;
  }

  const prediction = {
    matchId: String(matchId),
    username: SESSION.username,
    pred1: score1,
    pred2: score2,
    submittedAt: new Date().toISOString(),
    pointsAwarded: null,
    scoredAt: null,
  };

  STATE.predictions[String(matchId)] = prediction;
  writeLocalObject(
    `ggo_wc_predictions_${SESSION.username || "demo"}`,
    STATE.predictions,
  );
  showToast(`Saved: ${fixture.team1} ${score1}-${score2} ${fixture.team2}`);

  if (db && SESSION.username) {
    try {
      await db
        .collection("predictions")
        .doc(`${SESSION.username}_${matchId}`)
        .set(
          {
            ...prediction,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
    } catch (error) {
      showToast("Save failed - stored locally", "error");
      console.error("Could not save prediction to Firestore.", error);
    }
  }

  renderPredictions();
  renderGroupStandings();
  renderLeaderboard();
}

function renderPredictions() {
  const container = document.getElementById("predictions-list");
  if (!container) return;

  const visibleFixtures = STATE.fixtures.filter((fixture) => {
    if (activeMatchFilter === "open") return !isLocked(fixture);
    if (activeMatchFilter === "locked") return isLocked(fixture);
    return true;
  });

  if (!visibleFixtures.length) {
    container.innerHTML = emptyState(
      "Fixtures are not loaded yet.",
      "Run the app from a local server or seed Firestore fixtures.",
    );
    return;
  }

  const groups = groupBy(visibleFixtures, (fixture) => {
    if (fixture.kickoffDate) {
      return fixture.kickoffDate.toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }

    return fixture.date || "Unknown Date";
  });
  container.innerHTML = Object.entries(groups)
    .map(([groupName, fixtures]) => {
      return `
        <section class="group-section">
          <h3>${escapeHtml(groupName)}</h3>
          <div class="group-matches">
            ${fixtures.map(renderPredictionCard).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderPredictionCard(match) {
  const pred = STATE.predictions[match.matchId] || {};
  const result = STATE.results[match.matchId];
  const locked = isLocked(match);
  const status = getMatchStatus(match, result);
  const team1Code = getTeamCode(match.team1);
  const team2Code = getTeamCode(match.team2);
  const venue = getVenueDetails(match);
  const hasPred = hasPrediction(pred);
  const hasRes = result && hasResult(result);
  const points =
    hasRes && hasPred
      ? calculateMatchPoints(
          pred.pred1,
          pred.pred2,
          result.score1,
          result.score2,
        )
      : null;

  // Determine points tier for styling
  const ptsTier =
    points === null
      ? ""
      : points >= 15
        ? "pts-exact"
        : points >= 8
          ? "pts-good"
          : points > 0
            ? "pts-partial"
            : "pts-zero";

  const isLive = result && isLiveStatus(result.status);
  const isFinal = result && isFinalStatus(result.status);
  const statusLineHtml =
    locked && !hasRes
      ? '<div class="mc-status-line"><span class="status-token">LOCK</span><span>Locked - predictions closed</span></div>'
      : hasPred && !locked && !hasRes
        ? '<div class="mc-status-line"><span class="status-token">SAVED</span><span>Prediction saved</span></div>'
        : "";
  const resultScoreHtml = hasRes
    ? `
      <div class="mc-result-block">
        <div class="mc-result-label">${isLive ? "Live Score" : "Result"}</div>
        <div class="mc-result-score">${result.score1} <span class="mc-dash">-</span> ${result.score2}</div>
        ${
          hasPred
            ? `<div class="mc-pick-line">Your pick ${pred.pred1}-${pred.pred2}</div>`
            : ""
        }
      </div>`
    : `<div class="mc-vs">VS</div>`;

  return `
    <article class="match-card ${locked ? "locked" : "open"} ${isLive ? "live" : ""} ${isFinal ? "final" : ""}">
      <div class="mc-header">
        <div class="mc-meta">
          <span class="mc-kickoff"><span class="meta-label">Kickoff</span>${formatKickoff(match)}</span>
          <a class="mc-venue" href="${venue.mapsUrl}" target="_blank" rel="noopener noreferrer">
            <span class="meta-label">City</span>
            <strong>${escapeHtml(venue.city)}</strong>
            <span>${escapeHtml(venue.stadium)}</span>
          </a>
        </div>
        <span class="mc-badge ${status.className}">
          ${isLive ? '<span class="live-dot"></span>' : ""}${status.label}
        </span>
      </div>

      <div class="mc-body">
        <div class="mc-team">
          <div class="team-mark">${escapeHtml(team1Code)}</div>
          <div class="mc-name">${escapeHtml(match.team1)}</div>
          ${
            hasRes
              ? `<div class="mc-pred-score">${Number.isInteger(pred.pred1) ? pred.pred1 : "-"}</div>`
              : `<input class="score-input ${locked ? "" : "editable"}" type="number" min="0" max="20"
            inputmode="numeric" placeholder="-"
            value="${Number.isInteger(pred.pred1) ? pred.pred1 : ""}"
            ${locked ? "disabled" : ""}
            data-matchid="${match.matchId}" data-team="1"
            onchange="handleScoreChange('${match.matchId}')">`
          }
        </div>

        <div class="mc-middle">
          ${resultScoreHtml}
          ${points !== null ? `<div class="mc-points ${ptsTier}">${points}<span>pts</span></div>` : ""}
        </div>

        <div class="mc-team">
          <div class="team-mark">${escapeHtml(team2Code)}</div>
          <div class="mc-name">${escapeHtml(match.team2)}</div>
          ${
            hasRes
              ? `<div class="mc-pred-score">${Number.isInteger(pred.pred2) ? pred.pred2 : "-"}</div>`
              : `<input class="score-input ${locked ? "" : "editable"}" type="number" min="0" max="20"
            inputmode="numeric" placeholder="-"
            value="${Number.isInteger(pred.pred2) ? pred.pred2 : ""}"
            ${locked ? "disabled" : ""}
            data-matchid="${match.matchId}" data-team="2"
            onchange="handleScoreChange('${match.matchId}')">`
          }
        </div>
      </div>

      ${statusLineHtml ? `<div class="mc-footer">${statusLineHtml}</div>` : ""}
    </article>
  `;
}

function handleScoreChange(matchId) {
  const input1 = document.querySelector(
    `.score-input[data-matchid="${cssEscape(matchId)}"][data-team="1"]`,
  );
  const input2 = document.querySelector(
    `.score-input[data-matchid="${cssEscape(matchId)}"][data-team="2"]`,
  );

  if (!input1 || !input2 || input1.value === "" || input2.value === "") return;
  savePrediction(matchId, input1.value, input2.value);
}

function renderGroupStandings() {
  const container = document.getElementById("group-standings");
  if (!container) return;

  const groupFixtures = STATE.fixtures.filter(
    (fixture) => fixture.stage === "group" && fixture.group,
  );
  const groups = groupBy(groupFixtures, (fixture) => fixture.group);

  if (!Object.keys(groups).length) {
    container.innerHTML = emptyState(
      "Group tables need group-stage fixtures.",
      "",
    );
    return;
  }

  container.innerHTML = Object.entries(groups)
    .map(([groupName, fixtures]) => renderGroupTable(groupName, fixtures))
    .join("");
}

function renderGroupTable(groupName, fixtures) {
  const teamMap = new Map();

  fixtures.forEach((fixture) => {
    [fixture.team1, fixture.team2].forEach((team) => {
      if (!teamMap.has(team)) {
        teamMap.set(team, {
          team,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          points: 0,
        });
      }
    });

    const pred = STATE.predictions[fixture.matchId];
    if (!hasPrediction(pred)) return;

    applyTableResult(
      teamMap.get(fixture.team1),
      teamMap.get(fixture.team2),
      pred.pred1,
      pred.pred2,
    );
  });

  const standings = Array.from(teamMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.localeCompare(b.team);
  });

  return `
    <article class="group-table">
      <div class="group-header">${escapeHtml(groupName)}</div>
      <table class="group-standings-table">
        <thead>
          <tr>
            <th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
          </tr>
        </thead>
        <tbody>
          ${standings
            .map(
              (row, index) => `
                <tr>
                  <td class="team-rank">${index + 1}</td>
                  <td><span class="team-code">${escapeHtml(getTeamCode(row.team))}</span>${escapeHtml(row.team)}</td>
                  <td>${row.played}</td>
                  <td>${row.won}</td>
                  <td>${row.drawn}</td>
                  <td>${row.lost}</td>
                  <td>${row.gd > 0 ? "+" : ""}${row.gd}</td>
                  <td><strong>${row.points}</strong></td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </article>
  `;
}

function renderLeaderboard() {
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  const rows = STATE.leaderboard.length
    ? STATE.leaderboard
    : buildLocalLeaderboard();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No predictions yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((player, index) => {
      const rank = player.rank || index + 1;
      const name =
        player.displayName || player.playerName || player.username || "Player";
      return `
        <tr class="${player.username === SESSION.username ? "current-user" : ""}">
          <td><span class="rank-badge ${rankClass(rank)}">${rank}</span></td>
          <td>
            <div class="player-info">
              <span class="player-avatar">${getInitials(name)}</span>
              <span class="player-name">${escapeHtml(name)}</span>
            </div>
          </td>
          <td><strong>${player.totalPoints || 0}</strong></td>
          <td>${player.exactScores || player.exactCount || 0}</td>
          <td>${player.correctOutcomes || player.outcomeCount || 0}</td>
          <td>${player.predicted || 0}</td>
        </tr>
      `;
    })
    .join("");
}

function renderResults() {
  const container = document.getElementById("results-list");
  if (!container) return;

  let fixtures = STATE.fixtures.filter(
    (fixture) => STATE.results[fixture.matchId],
  );
  if (activeResultFilter === "live") {
    fixtures = fixtures.filter((fixture) =>
      isLiveStatus(STATE.results[fixture.matchId].status),
    );
  }
  if (activeResultFilter === "ft") {
    fixtures = fixtures.filter((fixture) =>
      isFinalStatus(STATE.results[fixture.matchId].status),
    );
  }

  if (!fixtures.length) {
    container.innerHTML = emptyState(
      "No results synced yet.",
      "Results will appear after Apps Script writes them to Firestore.",
    );
    return;
  }

  container.innerHTML = fixtures
    .map((fixture) => {
      const result = STATE.results[fixture.matchId];
      const pred = STATE.predictions[fixture.matchId];
      const points =
        hasPrediction(pred) && hasResult(result)
          ? calculateMatchPoints(
              pred.pred1,
              pred.pred2,
              result.score1,
              result.score2,
            )
          : null;

      return `
        <article class="result-card">
          <div class="match-date">${formatKickoff(fixture)}</div>
          <div class="match-teams">
            <div class="team"><div class="team-name"><span class="team-code">${escapeHtml(getTeamCode(fixture.team1))}</span>${escapeHtml(fixture.team1)}</div></div>
            <div class="result-score">${result.score1 ?? "-"} - ${result.score2 ?? "-"}</div>
            <div class="team"><div class="team-name"><span class="team-code">${escapeHtml(getTeamCode(fixture.team2))}</span>${escapeHtml(fixture.team2)}</div></div>
          </div>
          <div class="result-status">${escapeHtml(result.status || "NS")}</div>
          <div class="match-footer">
            <span>Your pick: ${hasPrediction(pred) ? `${pred.pred1}-${pred.pred2}` : "none"}</span>
            ${points === null ? "" : `<strong>${points} pts</strong>`}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderBracket() {
  const bracket = document.getElementById("bracket");
  if (!bracket) return;

  const rounds = [
    "Round of 32",
    "Round of 16",
    "Quarter-final",
    "Semi-final",
    "Match for third place",
    "Final",
  ];
  const knockout = STATE.fixtures.filter(
    (fixture) => fixture.stage !== "group",
  );

  if (!knockout.length) {
    bracket.innerHTML = emptyState("Knockout fixtures are not loaded yet.", "");
    return;
  }

  bracket.innerHTML = rounds
    .map((round, roundIndex) => {
      const matches = knockout.filter((fixture) => fixture.round === round);
      return `
        <section class="bracket-round bracket-round-${roundIndex + 1}">
          <h3>${escapeHtml(round)}</h3>
          <div class="bracket-stack">
          ${matches
            .map((match) => {
              const result = STATE.results[match.matchId];
              const score = result && hasResult(result) ? `${result.score1}-${result.score2}` : "vs";
              return `
                <div class="bracket-match">
                  <div class="bracket-seed">
                    <span class="team-code">${escapeHtml(getTeamCode(match.team1))}</span>
                    <span>${escapeHtml(match.team1)}</span>
                  </div>
                  <strong>${score}</strong>
                  <div class="bracket-seed">
                    <span class="team-code">${escapeHtml(getTeamCode(match.team2))}</span>
                    <span>${escapeHtml(match.team2)}</span>
                  </div>
                </div>
              `;
            })
            .join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderAdmin() {
  const container = document.getElementById("admin-content");
  if (!container || !SESSION.isAdmin) return;

  container.innerHTML = `
    <div class="admin-grid">
      <button class="btn-primary sync-btn" type="button" onclick="requestSync()">Refresh Data</button>
      <div class="admin-card">
        <strong>${STATE.fixtures.length}</strong>
        <span>fixtures loaded</span>
      </div>
      <div class="admin-card">
        <strong>${Object.keys(STATE.predictions).length}</strong>
        <span>your predictions</span>
      </div>
      <div class="admin-card">
        <strong>${Object.keys(STATE.results).length}</strong>
        <span>results synced</span>
      </div>
    </div>
  `;
}

function filterMatches(type, btn) {
  activeMatchFilter = type;
  document
    .querySelectorAll("#view-predictions .filter-btn")
    .forEach((button) => {
      button.classList.remove("active");
    });
  if (btn) btn.classList.add("active");
  renderPredictions();
}

function filterResults(type, btn) {
  activeResultFilter = type;
  document.querySelectorAll("#view-results .filter-btn").forEach((button) => {
    button.classList.remove("active");
  });
  if (btn) btn.classList.add("active");
  renderResults();
}

function toggleRules(show) {
  const modal = document.getElementById("rules-modal");
  if (!modal) return;
  if (show) {
    const usernameEl = document.getElementById("rules-username");
    if (usernameEl) {
      usernameEl.textContent =
        SESSION.displayName || SESSION.username || "Employee";
    }
    modal.classList.add("show");
  } else {
    modal.classList.remove("show");
    if (SESSION.username) {
      localStorage.setItem(`ggo_wc_rules_shown_${SESSION.username}`, "true");
    }
  }
}

function toggleSettings(show) {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;

  if (show) {
    document.getElementById("setting-api-url").value = CONFIG.appsScriptUrl;
    document.getElementById("setting-api-key").value = CONFIG.apiKey;
    modal.classList.add("show");
  } else {
    modal.classList.remove("show");
  }
}

function saveSettings() {
  CONFIG.appsScriptUrl = document
    .getElementById("setting-api-url")
    .value.trim();
  CONFIG.apiKey = document.getElementById("setting-api-key").value.trim();
  localStorage.setItem("ggo_wc_url", CONFIG.appsScriptUrl);
  localStorage.setItem("ggo_wc_key", CONFIG.apiKey);
  toggleSettings(false);
  requestSync();
}

function parseKickoff(date, time, kickoffUTC) {
  // ALWAYS try to derive from date+time fields first.
  // Firestore may have kickoffUTC stored incorrectly (local time saved as UTC).
  if (date && time) {
    const match = String(time).match(
      /(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2}(?:\.\d+)?)/i,
    );
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      const offset = Number(match[3]);
      const [y, m, d] = date.split("-").map(Number);
      // hour - offset converts local stadium time to UTC
      return new Date(Date.UTC(y, m - 1, d, hour - offset, minute));
    }
  }

  // Fallback: try kickoffUTC from Firestore only if it looks like a full ISO string
  // (contains 'T' so it's not just a bare date/time).
  if (kickoffUTC && String(kickoffUTC).includes("T")) {
    const parsed = new Date(kickoffUTC);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  // Last resort: date-only → treat as open (return null so match stays unlocked)
  return null;
}

async function loadTeamMeta() {
  try {
    if (db) {
      try {
        const snap = await db.collection("teams").get();
        if (!snap.empty) {
          STATE.teams = {};
          snap.docs.forEach((doc) => {
            const team = doc.data();
            const code = team.fifa_code || shortTeamCode(team.name);
            [team.name, team.name_normalised, team.fifa_code]
              .filter(Boolean)
              .forEach((key) => {
                STATE.teams[normalizeTeamKey(key)] = code;
              });
          });
          return;
        }
      } catch (firestoreError) {
        console.error("Firestore team load failed:", firestoreError.message);
      }
    }

    const response = await fetch("2026/worldcup.teams.json", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const teams = await response.json();
    STATE.teams = (teams || []).reduce((acc, team) => {
      const code = team.fifa_code || shortTeamCode(team.name);
      [team.name, team.name_normalised, team.fifa_code]
        .filter(Boolean)
        .forEach((key) => {
          acc[normalizeTeamKey(key)] = code;
        });
      return acc;
    }, {});
  } catch (error) {
    console.error("Team flags unavailable.", error.message);
    STATE.teams = {};
  }
}
async function loadGameData() {
  if (!CONFIG.appsScriptUrl) return;

  try {
    const response = await fetch(
      `${CONFIG.appsScriptUrl.replace(/\/$/, "")}?action=sync`,
      {
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (Array.isArray(data.fixtures) && data.fixtures.length) {
      STATE.fixtures = data.fixtures.map(normalizeFixture);
    }
    if (data.results) {
      STATE.results = normalizeResultsPayload(data.results);
    }
    if (Array.isArray(data.leaderboard)) {
      STATE.leaderboard = data.leaderboard;
    }
    if (Array.isArray(data.users)) {
      STATE.users = data.users;
    }
  } catch (error) {
    console.warn("Game data API sync failed.", error.message);
  }
}

async function loadFixturesFromApi() {
  if (!CONFIG.appsScriptUrl) return [];
  try {
    const response = await fetch(
      `${CONFIG.appsScriptUrl.replace(/\/$/, "")}?action=fixtures`,
      {
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data.fixtures)) {
      return data.fixtures.map(normalizeFixture);
    }
  } catch (error) {
    console.warn("Fixtures API unavailable.", error.message);
  }
  return [];
}

async function loadResultsFromApi() {
  // Results are already hydrated by loadGameData(); avoid a second round-trip.
  return normalizeResultsPayload(STATE.results);
}

async function loadLeaderboardFromApi() {
  if (!CONFIG.appsScriptUrl) return [];
  try {
    const response = await fetch(
      `${CONFIG.appsScriptUrl.replace(/\/$/, "")}?action=leaderboard`,
      {
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.leaderboard) ? data.leaderboard : [];
  } catch (error) {
    return [];
  }
}

function normalizeResultsPayload(results) {
  if (Array.isArray(results)) {
    return results.reduce((acc, item) => {
      const normalized = normalizeResult(item);
      acc[normalized.matchId] = normalized;
      return acc;
    }, {});
  }

  if (results && typeof results === "object") {
    return Object.entries(results).reduce((acc, [key, item]) => {
      const normalized = normalizeResult({ matchId: key, ...item });
      acc[normalized.matchId] = normalized;
      return acc;
    }, {});
  }

  return {};
}

function getStageFromRound(round = "") {
  const value = String(round).toLowerCase();
  if (value.includes("group") || value.includes("matchday")) return "group";
  if (value.includes("32")) return "r32";
  if (value.includes("16")) return "r16";
  if (value.includes("quarter")) return "qf";
  if (value.includes("semi")) return "sf";
  if (value.includes("third")) return "third";
  if (value.includes("final")) return "final";
  return "group";
}

function stageLabel(stage) {
  return (
    {
      group: "Group Stage",
      r32: "Round of 32",
      r16: "Round of 16",
      qf: "Quarter-final",
      sf: "Semi-final",
      third: "Third Place",
      final: "Final",
    }[stage] || "Matches"
  );
}

function isLocked(match) {
  if (!match.kickoffDate) return false;
  return Date.now() >= match.kickoffDate.getTime() - 15 * 60 * 1000;
}

function getMatchStatus(match, result) {
  if (result && isFinalStatus(result.status))
    return { label: "Final", className: "locked" };
  if (result && isLiveStatus(result.status)) {
    const statusLabel = String(result.status).toUpperCase();
    return { label: `Live${statusLabel && statusLabel !== "LIVE" ? ` - ${statusLabel}` : ""}`, className: "live" };
  }
  if (isLocked(match)) return { label: "Locked", className: "locked" };
  return { label: "Open", className: "open" };
}

function hasPrediction(prediction) {
  return (
    prediction &&
    Number.isInteger(prediction.pred1) &&
    Number.isInteger(prediction.pred2)
  );
}

function hasResult(result) {
  return (
    result && Number.isInteger(result.score1) && Number.isInteger(result.score2)
  );
}

/**
 * Client-side scoring - mirrors canonical scoreMatch on the backend.
 * Points: exact=15, correct result plus close goal difference=8,
 * correct result=5, close score with wrong result=3, otherwise 0.
 */
function calculateMatchPoints(pred1, pred2, actual1, actual2) {
  if (pred1 === actual1 && pred2 === actual2) return 15;

  const predOutcome = Math.sign(pred1 - pred2);
  const actualOutcome = Math.sign(actual1 - actual2);

  if (predOutcome === actualOutcome) {
    const diffGap = Math.abs(pred1 - pred2 - (actual1 - actual2));
    return diffGap <= 1 ? 8 : 5;
  }

  // Wrong outcome - partial credit if total goal gap <= 2
  const totalGap = Math.abs(pred1 - actual1) + Math.abs(pred2 - actual2);
  return totalGap <= 2 ? 3 : 0;
}

function buildLocalLeaderboard() {
  if (!SESSION.username) return [];

  let totalPoints = 0;
  let exactScores = 0;
  let correctOutcomes = 0;
  let predicted = 0;

  Object.values(STATE.predictions).forEach((prediction) => {
    if (!hasPrediction(prediction)) return;
    predicted += 1;
    const result = STATE.results[String(prediction.matchId)];
    if (!hasResult(result)) return;

    const points = calculateMatchPoints(
      prediction.pred1,
      prediction.pred2,
      result.score1,
      result.score2,
    );
    totalPoints += points;
    if (points === 15) exactScores += 1;
    if (points > 0) correctOutcomes += 1;
  });

  return [
    {
      rank: 1,
      username: SESSION.username,
      displayName: SESSION.displayName || SESSION.username,
      totalPoints,
      exactScores,
      correctOutcomes,
      predicted,
    },
  ];
}

function applyTableResult(team1, team2, score1, score2) {
  team1.played += 1;
  team2.played += 1;
  team1.gf += score1;
  team1.ga += score2;
  team2.gf += score2;
  team2.ga += score1;

  if (score1 > score2) {
    team1.won += 1;
    team1.points += 3;
    team2.lost += 1;
  } else if (score2 > score1) {
    team2.won += 1;
    team2.points += 3;
    team1.lost += 1;
  } else {
    team1.drawn += 1;
    team2.drawn += 1;
    team1.points += 1;
    team2.points += 1;
  }

  team1.gd = team1.gf - team1.ga;
  team2.gd = team2.gf - team2.ga;
}

function formatKickoff(match) {
  if (!match.kickoffDate)
    return `${match.date || ""} ${match.time || ""}`.trim();
  return match.kickoffDate.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isLiveStatus(status = "") {
  return ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(
    String(status).toUpperCase(),
  );
}

function isFinalStatus(status = "") {
  return ["FT", "AET", "PEN", "COMPLETED", "FINAL"].includes(
    String(status).toUpperCase(),
  );
}

function rankClass(rank) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "";
}

function getInitials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function normalizeTeamKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value) {
  return String(value ?? "");
}

function getTeamCode(teamName) {
  const key = normalizeTeamKey(teamName);
  return STATE.teams[key] || shortTeamCode(teamName);
}

function shortTeamCode(teamName) {
  const clean = String(teamName || "TBD")
    .replace(/&/g, " ")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim();
  if (!clean || clean.toUpperCase() === "TBD") return "TBD";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function getVenueDetails(match) {
  const ground = match.ground || match.venue || "TBD";
  const known = STADIUMS_BY_GROUND[ground] || {};
  const city = known.city || ground;
  const stadium = known.stadium || ground;
  const mapsQuery = encodeURIComponent(`${stadium} ${city}`);
  return {
    city,
    stadium,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`,
  };
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item) || "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

function readLocalObject(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function writeLocalObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function emptyState(title, subtitle) {
  return `
    <div class="empty-state">
      <div class="empty-icon">WC</div>
      <p>${escapeHtml(title)}</p>
      ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(String(value));
  return String(value).replace(/"/g, '\\"');
}
