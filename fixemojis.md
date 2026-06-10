



index.html
File

PROJECT_BRIEF.md
File
currently emojis arent working

Your HTML already contains emoji characters, for example:

Trophy emoji in the login screen: 


Hourglass loading icon: 


Chart icon: 


Football icon: 


Trophy in the bracket section: 


If they're showing as empty boxes (□), black-and-white glyphs, or not appearing at all, the most common cause is the font stack.

You're loading only:

Barlow Condensed
DM Sans
Many web fonts don't include color emoji glyphs, so the browser may not find a suitable emoji font.

Try adding an emoji fallback in your CSS:

body {
  font-family:
    "DM Sans",
    "Segoe UI Emoji",
    "Apple Color Emoji",
    "Noto Color Emoji",
    sans-serif;
}
Or for the emoji elements specifically:

.trophy,
.empty-icon,
.champion-trophy {
  font-family:
    "Segoe UI Emoji",
    "Apple Color Emoji",
    "Noto Color Emoji",
    sans-serif;
}
Also check:

Is the problem happening locally, on GitHub Pages, or after deployment?

Are emojis missing everywhere or only inside buttons/cards?

Which browser are you testing in (Chrome, Edge, Firefox, Safari)?

If you upload your style.css, I can identify the exact CSS rule that's overriding the emoji font.


d8cd9ae6-4268-4274-bff4-0d700066def7.png
the emojis for the games 

From the screenshot, it looks like the country flag emojis are missing, not the general emojis.

I can see:

MX Mexico

ZA South Africa

KR South Korea

CZ Czech Republic

where I'd expect:

🇲🇽 Mexico

🇿🇦 South Africa

🇰🇷 South Korea

🇨🇿 Czech Republic

This usually happens because you're rendering the flags as Unicode regional-indicator emojis, but the active font doesn't support color flag glyphs.

If your code looks something like:

flag: "🇲🇽"
or

`${flag} ${team}`
then the fix is typically CSS:

.team-name,
.team-label,
.flag {
  font-family:
    "Segoe UI Emoji",
    "Apple Color Emoji",
    "Noto Color Emoji",
    sans-serif;
}
or even:

* {
  font-family:
    "DM Sans",
    "Segoe UI Emoji",
    "Apple Color Emoji",
    "Noto Color Emoji",
    sans-serif;
}
However, the fact that MX, ZA, KR, CZ are showing instead of blank squares makes me suspect your code is not using emoji flags at all. It may be deliberately rendering country codes:

<span class="team-flag">${team.code}</span>
which would output:

MX
ZA
KR
CZ
Can you show me the section of scripts/app.js (or wherever matches are rendered) that builds the team name HTML? Look for something like:

team1
team2
flag
countryCode
renderFixture
renderMatch
and paste that block. I can tell immediately whether the app is generating emojis or just outputting ISO country codes.


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

window.addEventListener("DOMContentLoaded", async () => {
  initFirebase();
  await loadTeamMeta();
  await hydrateLoginUsers();

  if (SESSION.token && SESSION.username) {
    showApp();
  }

  window.setInterval(() => {
    if (document.getElementById("app")?.style.display !== "none") {
      renderPredictions();
      renderResults();
      renderGroupStandings();
    }
  }, 30000);
});

function initFirebase() {
  if (!window.firebase || !firebase.initializeApp || !firebase.firestore) {
    console.warn("Firebase compat SDK not available. Using local fallback mode.");
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase initialized");
  } catch (error) {
    console.warn("Firebase init failed. Using local fallback mode.", error.message);
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

    SESSION.token = btoa(${username}:${Date.now()});
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
  document.getElementById("admin-nav-btn").style.display = SESSION.isAdmin
    ? ""
    : "none";

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

  const view = document.getElementById(view-${id});
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
      timeEl.textContent = Live - ${STATE.lastSync.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })};
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
      fixtures = snap.docs.map((doc) => normalizeFixture({ id: doc.id, ...doc.data() }));
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
    if (!response.ok) throw new Error(HTTP ${response.status});
    const data = await response.json();
    return (data.matches || []).map((match, index) =>
      normalizeFixture({
        ...match,
        matchId: match.num || index + 1,
      })
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
        STATE.results[matchId] = normalizeResult({ id: doc.id, ...result, matchId });
      });
    } catch (error) {
      console.warn("Could not load Firestore results.", error.message);
    }
  }

  const localResults = readLocalObject(ggo_wc_results_${SESSION.username || "demo"});
  STATE.results = { ...localResults, ...STATE.results };
}

async function loadPredictions() {
  STATE.predictions = readLocalObject(ggo_wc_predictions_${SESSION.username || "demo"});

  if (!db || !SESSION.username) return;

  try {
    const snap = await db
      .collection("predictions")
      .where("username", "==", SESSION.username)
      .get();
    snap.docs.forEach((doc) => {
      const prediction = doc.data();
      STATE.predictions[String(prediction.matchId)] = normalizePrediction(prediction);
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
  const kickoffDate = parseKickoff(fixture.date, fixture.time, fixture.kickoffUTC);
  const stage = fixture.stage || getStageFromRound(fixture.round);

  return {
    ...fixture,
    matchId,
    group: fixture.group || stageLabel(stage),
    stage,
    kickoffUTC: kickoffDate ? kickoffDate.toISOString() : fixture.kickoffUTC || "",
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

async function savePrediction(matchId, pred1, pred2) {
  const fixture = STATE.fixtures.find((match) => match.matchId === String(matchId));
  const score1 = Number(pred1);
  const score2 = Number(pred2);

  if (!fixture) return;
  if (isLocked(fixture)) {
    alert("This match is locked. Predictions close 15 minutes before kickoff.");
    STATE.predictions[String(matchId)] = prediction;
  writeLocalObject(ggo_wc_predictions_${SESSION.username || "demo"}, STATE.predictions);
  showToast(Saved: ${match.team1} ${score1} – ${score2} ${match.team2});

  if (db && SESSION.username) {
    try {
      await db.collection("predictions").doc(${SESSION.username}_${matchId}).set(
        { ...prediction, submittedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      showToast(✓ ${match.team1} ${score1} – ${score2} ${match.team2});
    } catch (error) {
      showToast("Save failed — stored locally", "error");
      console.error("Could not save prediction to Firestore.", error);
    }
  }

  renderPredictions();
  renderGroupStandings();
  renderLeaderboard();
    return;
  }
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0) {
    showToast("Please enter valid scores.", "error");
    return;
  }
  
function showToast(message, type = "success") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = toast toast-${type} show;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 2500);
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
  writeLocalObject(ggo_wc_predictions_${SESSION.username || "demo"}, STATE.predictions);

  if (db && SESSION.username) {
    try {
      await db.collection("predictions").doc(${SESSION.username}_${matchId}).set(
        {
          ...prediction,
          submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
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
      "Run the app from a local server or seed Firestore fixtures."
    );
    return;
  }

  const groups = groupBy(visibleFixtures, (fixture) => fixture.group || fixture.round || "Matches");

  container.innerHTML = Object.entries(groups)
    .map(([groupName, fixtures]) => {
      return 
        <section class="group-section">
          <h3>${escapeHtml(groupName)}</h3>
          <div class="group-matches">
            ${fixtures.map(renderPredictionCard).join("")}
          </div>
        </section>
      ;
    })
    .join("");
}

function renderPredictionCard(match) {
  const pred = STATE.predictions[match.matchId] || {};
  const result = STATE.results[match.matchId];
  const locked = isLocked(match);
  const status = getMatchStatus(match, result);
  const team1Flag = getTeamFlag(match.team1);
  const team2Flag = getTeamFlag(match.team2);
  const points = result && hasResult(result) && hasPrediction(pred)
    ? calculateMatchPoints(pred.pred1, pred.pred2, result.score1, result.score2)
    : null;

  return 
    <article class="match-card ${locked ? "locked" : "open"}">
      <div class="match-header">
        <div>
          <div class="match-date">${formatKickoff(match)}</div>
          <div class="match-ground">${escapeHtml(match.ground)}</div>
        </div>
        <span class="match-status ${status.className}">${status.label}</span>
      </div>
      <div class="match-teams">
        <div class="team">
          <div class="team-name"><span class="team-flag">${escapeHtml(team1Flag)}</span>${escapeHtml(match.team1)}</div>
          <input class="score-input" type="number" min="0" max="20" inputmode="numeric"
            value="${Number.isInteger(pred.pred1) ? pred.pred1 : ""}"
            ${locked ? "disabled" : ""}
            data-matchid="${match.matchId}" data-team="1"
            onchange="handleScoreChange('${match.matchId}')">
        </div>
        <div class="vs">VS</div>
        <div class="team">
          <div class="team-name"><span class="team-flag">${escapeHtml(team2Flag)}</span>${escapeHtml(match.team2)}</div>
          <input class="score-input" type="number" min="0" max="20" inputmode="numeric"
            value="${Number.isInteger(pred.pred2) ? pred.pred2 : ""}"
            ${locked ? "disabled" : ""}
            data-matchid="${match.matchId}" data-team="2"
            onchange="handleScoreChange('${match.matchId}')">
        </div>
      </div>
      <div class="match-footer">
        <span>${locked ? "Locked 15 minutes before kickoff" : hasPrediction(pred) ? "Saved prediction" : "No prediction yet"}</span>
        ${points === null ? "" : <strong>${points} pts</strong>}
      </div>
    </article>
  ;
}

function handleScoreChange(matchId) {
  const input1 = document.querySelector(
    .score-input[data-matchid="${cssEscape(matchId)}"][data-team="1"]
  );
  const input2 = document.querySelector(
    .score-input[data-matchid="${cssEscape(matchId)}"][data-team="2"]
  );

  if (!input1 || !input2 || input1.value === "" || input2.value === "") return;
  savePrediction(matchId, input1.value, input2.value);
}

function renderGroupStandings() {
  const container = document.getElementById("group-standings");
  if (!container) return;

  const groupFixtures = STATE.fixtures.filter((fixture) => fixture.stage === "group" && fixture.group);
  const groups = groupBy(groupFixtures, (fixture) => fixture.group);

  if (!Object.keys(groups).length) {
    container.innerHTML = emptyState("Group tables need group-stage fixtures.", "");
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

    applyTableResult(teamMap.get(fixture.team1), teamMap.get(fixture.team2), pred.pred1, pred.pred2);
  });

  const standings = Array.from(teamMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.localeCompare(b.team);
  });

  return 
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
              (row, index) => 
                <tr>
                  <td class="team-rank">${index + 1}</td>
                  <td><span class="team-flag">${getTeamFlag(row.team)}</span>${escapeHtml(row.team)}</td>
                  <td>${row.played}</td>
                  <td>${row.won}</td>
                  <td>${row.drawn}</td>
                  <td>${row.lost}</td>
                  <td>${row.gd > 0 ? "+" : ""}${row.gd}</td>
                  <td><strong>${row.points}</strong></td>
                </tr>
              
            )
            .join("")}
        </tbody>
      </table>
    </article>
  ;
}

function renderLeaderboard() {
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  const rows = STATE.leaderboard.length ? STATE.leaderboard : buildLocalLeaderboard();

  if (!rows.length) {
    tbody.innerHTML = <tr><td colspan="6" class="table-empty">No predictions yet.</td></tr>;
    return;
  }

  tbody.innerHTML = rows
    .map((player, index) => {
      const rank = player.rank || index + 1;
      const name = player.displayName || player.playerName || player.username || "Player";
      return 
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
      ;
    })
    .join("");
}

function renderResults() {
  const container = document.getElementById("results-list");
  if (!container) return;

  let fixtures = STATE.fixtures.filter((fixture) => STATE.results[fixture.matchId]);
  if (activeResultFilter === "live") {
    fixtures = fixtures.filter((fixture) => isLiveStatus(STATE.results[fixture.matchId].status));
  }
  if (activeResultFilter === "ft") {
    fixtures = fixtures.filter((fixture) => isFinalStatus(STATE.results[fixture.matchId].status));
  }

  if (!fixtures.length) {
    container.innerHTML = emptyState("No results synced yet.", "Results will appear after Apps Script writes them to Firestore.");
    return;
  }

  container.innerHTML = fixtures
    .map((fixture) => {
      const result = STATE.results[fixture.matchId];
      const pred = STATE.predictions[fixture.matchId];
      const points = hasPrediction(pred) && hasResult(result)
        ? calculateMatchPoints(pred.pred1, pred.pred2, result.score1, result.score2)
        : null;

      return 
        <article class="result-card">
          <div class="match-date">${formatKickoff(fixture)}</div>
          <div class="match-teams">
            <div class="team"><div class="team-name"><span class="team-flag">${getTeamFlag(fixture.team1)}</span>${escapeHtml(fixture.team1)}</div></div>
            <div class="result-score">${result.score1 ?? "-"} - ${result.score2 ?? "-"}</div>
            <div class="team"><div class="team-name"><span class="team-flag">${getTeamFlag(fixture.team2)}</span>${escapeHtml(fixture.team2)}</div></div>
          </div>
          <div class="result-status">${escapeHtml(result.status || "NS")}</div>
          <div class="match-footer">
            <span>Your pick: ${hasPrediction(pred) ? ${pred.pred1}-${pred.pred2} : "none"}</span>
            ${points === null ? "" : <strong>${points} pts</strong>}
          </div>
        </article>
      ;
    })
    .join("");
}

function renderBracket() {
  const bracket = document.getElementById("bracket");
  if (!bracket) return;

  const rounds = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Match for third place", "Final"];
  const knockout = STATE.fixtures.filter((fixture) => fixture.stage !== "group");

  if (!knockout.length) {
    bracket.innerHTML = emptyState("Knockout fixtures are not loaded yet.", "");
    return;
  }

  bracket.innerHTML = rounds
    .map((round) => {
      const matches = knockout.filter((fixture) => fixture.round === round);
      return 
        <section class="bracket-round">
          <h3>${escapeHtml(round)}</h3>
          ${matches
            .map((match) => {
              const result = STATE.results[match.matchId];
              return 
                <div class="bracket-match">
                  <div><span class="team-flag">${getTeamFlag(match.team1)}</span>${escapeHtml(match.team1)}</div>
                  <strong>${result && hasResult(result) ? ${result.score1}-${result.score2} : "vs"}</strong>
                  <div><span class="team-flag">${getTeamFlag(match.team2)}</span>${escapeHtml(match.team2)}</div>
                </div>
              ;
            })
            .join("")}
        </section>
      ;
    })
    .join("");
}

function renderAdmin() {
  const container = document.getElementById("admin-content");
  if (!container || !SESSION.isAdmin) return;

  container.innerHTML = 
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
  ;
}

function filterMatches(type, btn) {
  activeMatchFilter = type;
  document.querySelectorAll("#view-predictions .filter-btn").forEach((button) => {
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
  CONFIG.appsScriptUrl = document.getElementById("setting-api-url").value.trim();
  CONFIG.apiKey = document.getElementById("setting-api-key").value.trim();
  localStorage.setItem("ggo_wc_url", CONFIG.appsScriptUrl);
  localStorage.setItem("ggo_wc_key", CONFIG.apiKey);
  toggleSettings(false);
  requestSync();
}

function parseKickoff(date, time, kickoffUTC) {
  if (kickoffUTC) {
    const parsed = new Date(kickoffUTC);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (!date || !time) return null;

  const match = String(time).match(/(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})/i);
  if (!match) {
    const fallback = new Date(${date}T00:00:00Z);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const offset = Number(match[3]);
  return new Date(Date.UTC(...date.split("-").map(Number).map((part, index) => index === 1 ? part - 1 : part), hour - offset, minute));
}

async function loadTeamMeta() {
  try {
    const response = await fetch("2026/worldcup.teams.json", { cache: "no-store" });
    if (!response.ok) throw new Error(HTTP ${response.status});
    const teams = await response.json();
    STATE.teams = (teams || []).reduce((acc, team) => {
      const flag = team.flag_icon || "🏳";
      [team.name, team.name_normalised, team.fifa_code].filter(Boolean).forEach((key) => {
        acc[normalizeTeamKey(key)] = flag;
      });
      return acc;
    }, {});
  } catch (error) {
    console.warn("Team flags unavailable.", error.message);
    STATE.teams = {};
  }
}

async function loadGameData() {
  if (!CONFIG.appsScriptUrl) return;

  try {
    const response = await fetch(${CONFIG.appsScriptUrl.replace(/\/$/, "")}?action=sync, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(HTTP ${response.status});
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
    const response = await fetch(${CONFIG.appsScriptUrl.replace(/\/$/, "")}?action=fixtures, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(HTTP ${response.status});
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
  if (!CONFIG.appsScriptUrl) return {};
  try {
    const response = await fetch(${CONFIG.appsScriptUrl.replace(/\/$/, "")}?action=sync, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(HTTP ${response.status});
    const data = await response.json();
    return normalizeResultsPayload(data.results);
  } catch (error) {
    return {};
  }
}

async function loadLeaderboardFromApi() {
  if (!CONFIG.appsScriptUrl) return [];
  try {
    const response = await fetch(${CONFIG.appsScriptUrl.replace(/\/$/, "")}?action=leaderboard, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(HTTP ${response.status});
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
  return {
    group: "Group Stage",
    r32: "Round of 32",
    r16: "Round of 16",
    qf: "Quarter-final",
    sf: "Semi-final",
    third: "Third Place",
    final: "Final",
  }[stage] || "Matches";
}

function isLocked(match) {
  if (!match.kickoffDate) return false;
  return Date.now() >= match.kickoffDate.getTime() - 15 * 60 * 1000;
}

function getMatchStatus(match, result) {
  if (result && isFinalStatus(result.status)) return { label: "Final", className: "locked" };
  if (result && isLiveStatus(result.status)) return { label: "Live", className: "live" };
  if (isLocked(match)) return { label: "Locked", className: "locked" };
  return { label: "Open", className: "open" };
}

function hasPrediction(prediction) {
  return prediction && Number.isInteger(prediction.pred1) && Number.isInteger(prediction.pred2);
}

function hasResult(result) {
  return result && Number.isInteger(result.score1) && Number.isInteger(result.score2);
}

function calculateMatchPoints(pred1, pred2, actual1, actual2) {
  if (pred1 === actual1 && pred2 === actual2) return 15;

  const predOutcome = Math.sign(pred1 - pred2);
  const actualOutcome = Math.sign(actual1 - actual2);
  if (predOutcome !== actualOutcome) {
    const close = Math.abs(pred1 - actual1) + Math.abs(pred2 - actual2) <= 2;
    return close ? 3 : 0;
  }

  const diffGap = Math.abs((pred1 - pred2) - (actual1 - actual2));
  return diffGap <= 1 ? 8 : 5;
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

    const points = calculateMatchPoints(prediction.pred1, prediction.pred2, result.score1, result.score2);
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
  if (!match.kickoffDate) return ${match.date || ""} ${match.time || ""}.trim();
  return match.kickoffDate.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isLiveStatus(status = "") {
  return ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(String(status).toUpperCase());
}

function isFinalStatus(status = "") {
  return ["FT", "AET", "PEN", "COMPLETED", "FINAL"].includes(String(status).toUpperCase());
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
  const text = String(value ?? "");
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

function getTeamFlag(teamName) {
  const key = normalizeTeamKey(teamName);
  return STATE.teams[key] || "🏳";
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
  return 
    <div class="empty-state">
      <div class="empty-icon">WC</div>
      <p>${escapeHtml(title)}</p>
      ${subtitle ? <small>${escapeHtml(subtitle)}</small> : ""}
    </div>
  ;
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

Found it.

Your app isn't rendering emoji flags at all. It's rendering whatever is stored in:

team.flag_icon
inside loadTeamMeta():

const flag = team.flag_icon || "🏳";

[team.name, team.name_normalised, team.fifa_code]
  .filter(Boolean)
  .forEach((key) => {
    acc[normalizeTeamKey(key)] = flag;
  });
Then later:

function getTeamFlag(teamName) {
  const key = normalizeTeamKey(teamName);
  return STATE.teams[key] || "🏳";
}
The screenshot shows:

MX
ZA
KR
CZ
which means your worldcup.teams.json contains:

{
  "name": "Mexico",
  "flag_icon": "MX"
}
instead of:

{
  "name": "Mexico",
  "flag_icon": "🇲🇽"
}
or

{
  "name": "Mexico",
  "flag_icon": "🇲🇽 "
}
So the issue is almost certainly in 2026/worldcup.teams.json, not in the rendering code.

To verify, open the JSON and look for entries like:

{
  "name": "Mexico",
  "fifa_code": "MEX",
  "flag_icon": "MX"
}
If that's what you see, replace them with real emoji:

{
  "name": "Mexico",
  "flag_icon": "🇲🇽"
},
{
  "name": "South Africa",
  "flag_icon": "🇿🇦"
},
{
  "name": "South Korea",
  "flag_icon": "🇰🇷"
},
{
  "name": "Czech Republic",
  "flag_icon": "🇨🇿"
}
If you want to avoid maintaining emojis in JSON, replace getTeamFlag() entirely:

function getTeamFlag(teamName) {
  const flags = {
    "Mexico": "🇲🇽",
    "South Africa": "🇿🇦",
    "South Korea": "🇰🇷",
    "Czech Republic": "🇨🇿",
    "United States": "🇺🇸",
    "Canada": "🇨🇦",
    "England": "🏴",
    "France": "🇫🇷",
    "Brazil": "🇧🇷",
    "Argentina": "🇦🇷"
  };

  return flags[teamName] || "🏳";
}
The quickest way to confirm is to paste the contents of 2026/worldcup.teams.json and I'll tell you exactly which field is wrong.


[
    {
        "name": "Mexico",
        "continent": "North America",
        "flag_icon": "🇲🇽",
        "flag_unicode": "\\u{1F1F2}\\u{1F1FD}",
        "fifa_code": "MEX",
        "group": "A",
        "confed": "CONCACAF"
    },
    {
        "name": "South Africa",
        "continent": "Africa",
        "flag_icon": "🇿🇦",
        "flag_unicode": "\\u{1F1FF}\\u{1F1E6}",
        "fifa_code": "RSA",
        "group": "A",
        "confed": "CAF"
    },
    {
        "name": "South Korea",
        "name_normalised": "Korea Republic",
        "continent": "Asia",
        "flag_icon": "🇰🇷",
        "flag_unicode": "\\u{1F1F0}\\u{1F1F7}",
        "fifa_code": "KOR",
        "group": "A",
        "confed": "AFC"
    },
    {
        "name": "Czech Republic",
        "name_normalised": "Czechia",
        "continent": "Europe",
        "flag_icon": "🇨🇿",
        "flag_unicode": "\\u{1F1E8}\\u{1F1FF}",
        "fifa_code": "CZE",
        "group": "A",
        "confed": "UEFA"
    },
    {
        "name": "Canada",
        "continent": "North America",
        "flag_icon": "🇨🇦",
        "flag_unicode": "\\u{1F1E8}\\u{1F1E6}",
        "fifa_code": "CAN",
        "group": "B",
        "confed": "CONCACAF"
    },
    {
        "name": "Bosnia & Herzegovina",
        "continent": "Europe",
        "flag_icon": "🇧🇦",
        "flag_unicode": "\\u{1F1E7}\\u{1F1E6}",
        "fifa_code": "BIH",
        "group": "B",
        "confed": "UEFA"
    },
    {
        "name": "Qatar",
        "continent": "Asia",
        "flag_icon": "🇶🇦",
        "flag_unicode": "\\u{1F1F6}\\u{1F1E6}",
        "fifa_code": "QAT",
        "group": "B",
        "confed": "AFC"
    },
    {
        "name": "Switzerland",
        "continent": "Europe",
        "flag_icon": "🇨🇭",
        "flag_unicode": "\\u{1F1E8}\\u{1F1ED}",
        "fifa_code": "SUI",
        "group": "B",
        "confed": "UEFA"
    },
    {
        "name": "Brazil",
        "continent": "South America",
        "flag_icon": "🇧🇷",
        "flag_unicode": "\\u{1F1E7}\\u{1F1F7}",
        "fifa_code": "BRA",
        "group": "C",
        "confed": "CONMEBOL"
    },
    {
        "name": "Morocco",
        "continent": "Africa",
        "flag_icon": "🇲🇦",
        "flag_unicode": "\\u{1F1F2}\\u{1F1E6}",
        "fifa_code": "MAR",
        "group": "C",
        "confed": "CAF"
    },
    {
        "name": "Haiti",
        "continent": "North America",
        "flag_icon": "🇭🇹",
        "flag_unicode": "\\u{1F1ED}\\u{1F1F9}",
        "fifa_code": "HAI",
        "group": "C",
        "confed": "CONCACAF"
    },
    {
        "name": "Scotland",
        "continent": "Europe",
        "flag_icon": "🏴",
        "flag_unicode": "\\u{1F3F4}\\u{E0067}\\u{E0062}\\u{E0073}\\u{E0063}\\u{E0074}\\u{E007F}",
        "fifa_code": "SCO",
        "group": "C",
        "confed": "UEFA"
    },
    {
        "name": "USA",
        "name_normalised": "United States",
        "continent": "North America",
        "flag_icon": "🇺🇸",
        "flag_unicode": "\\u{1F1FA}\\u{1F1F8}",
        "fifa_code": "USA",
        "group": "D",
        "confed": "CONCACAF"
    },
    {
        "name": "Paraguay",
        "continent": "South America",
        "flag_icon": "🇵🇾",
        "flag_unicode": "\\u{1F1F5}\\u{1F1FE}",
        "fifa_code": "PAR",
        "group": "D",
        "confed": "CONMEBOL"
    },
    {
        "name": "Australia",
        "continent": "Oceania",
        "flag_icon": "🇦🇺",
        "flag_unicode": "\\u{1F1E6}\\u{1F1FA}",
        "fifa_code": "AUS",
        "group": "D",
        "confed": "AFC"
    },
    {
        "name": "Turkey",
        "name_normalised": "Türkiye",
        "continent": "Europe",
        "flag_icon": "🇹🇷",
        "flag_unicode": "\\u{1F1F9}\\u{1F1F7}",
        "fifa_code": "TUR",
        "group": "D",
        "confed": "UEFA"
    },
    {
        "name": "Germany",
        "continent": "Europe",
        "flag_icon": "🇩🇪",
        "flag_unicode": "\\u{1F1E9}\\u{1F1EA}",
        "fifa_code": "GER",
        "group": "E",
        "confed": "UEFA"
    },
    {
        "name": "Curaçao",
        "continent": "North America",
        "flag_icon": "🇨🇼",
        "flag_unicode": "\\u{1F1E8}\\u{1F1FC}",
        "fifa_code": "CUW",
        "group": "E",
        "confed": "CONCACAF"
    },
    {
        "name": "Ivory Coast",
        "name_normalised": "Cote d'Ivoire",
        "continent": "Africa",
        "flag_icon": "🇨🇮",
        "flag_unicode": "\\u{1F1E8}\\u{1F1EE}",
        "fifa_code": "CIV",
        "group": "E",
        "confed": "CAF"
    },
    {
        "name": "Ecuador",
        "continent": "South America",
        "flag_icon": "🇪🇨",
        "flag_unicode": "\\u{1F1EA}\\u{1F1E8}",
        "fifa_code": "ECU",
        "group": "E",
        "confed": "CONMEBOL"
    },
    {
        "name": "Netherlands",
        "continent": "Europe",
        "flag_icon": "🇳🇱",
        "flag_unicode": "\\u{1F1F3}\\u{1F1F1}",
        "fifa_code": "NED",
        "group": "F",
        "confed": "UEFA"
    },
    {
        "name": "Japan",
        "continent": "Asia",
        "flag_icon": "🇯🇵",
        "flag_unicode": "\\u{1F1EF}\\u{1F1F5}",
        "fifa_code": "JPN",
        "group": "F",
        "confed": "AFC"
    },
    {
        "name": "Sweden",
        "continent": "Europe",
        "flag_icon": "🇸🇪",
        "flag_unicode": "\\u{1F1F8}\\u{1F1EA}",
        "fifa_code": "SWE",
        "group": "F",
        "confed": "UEFA"
    },
    {
        "name": "Tunisia",
        "continent": "Africa",
        "flag_icon": "🇹🇳",
        "flag_unicode": "\\u{1F1F9}\\u{1F1F3}",
        "fifa_code": "TUN",
        "group": "F",
        "confed": "CAF"
    },
    {
        "name": "Belgium",
        "continent": "Europe",
        "flag_icon": "🇧🇪",
        "flag_unicode": "\\u{1F1E7}\\u{1F1EA}",
        "fifa_code": "BEL",
        "group": "G",
        "confed": "UEFA"
    },
    {
        "name": "Egypt",
        "continent": "Africa",
        "flag_icon": "🇪🇬",
        "flag_unicode": "\\u{1F1EA}\\u{1F1EC}",
        "fifa_code": "EGY",
        "group": "G",
        "confed": "CAF"
    },
    {
        "name": "Iran",
        "name_normalised": "IR Iran",
        "continent": "Asia",
        "flag_icon": "🇮🇷",
        "flag_unicode": "\\u{1F1EE}\\u{1F1F7}",
        "fifa_code": "IRN",
        "group": "G",
        "confed": "AFC"
    },
    {
        "name": "New Zealand",
        "continent": "Oceania",
        "flag_icon": "🇳🇿",
        "flag_unicode": "\\u{1F1F3}\\u{1F1FF}",
        "fifa_code": "NZL",
        "group": "G",
        "confed": "OFC"
    },
    {
        "name": "Spain",
        "continent": "Europe",
        "flag_icon": "🇪🇸",
        "flag_unicode": "\\u{1F1EA}\\u{1F1F8}",
        "fifa_code": "ESP",
        "group": "H",
        "confed": "UEFA"
    },
    {
        "name": "Cape Verde",
        "name_normalised": "Cabo Verde",
        "continent": "Africa",
        "flag_icon": "🇨🇻",
        "flag_unicode": "\\u{1F1E8}\\u{1F1FB}",
        "fifa_code": "CPV",
        "group": "H",
        "confed": "CAF"
    },
    {
        "name": "Saudi Arabia",
        "continent": "Asia",
        "flag_icon": "🇸🇦",
        "flag_unicode": "\\u{1F1F8}\\u{1F1E6}",
        "fifa_code": "KSA",
        "group": "H",
        "confed": "AFC"
    },
    {
        "name": "Uruguay",
        "continent": "South America",
        "flag_icon": "🇺🇾",
        "flag_unicode": "\\u{1F1FA}\\u{1F1FE}",
        "fifa_code": "URU",
        "group": "H",
        "confed": "CONMEBOL"
    },
    {
        "name": "France",
        "continent": "Europe",
        "flag_icon": "🇫🇷",
        "flag_unicode": "\\u{1F1EB}\\u{1F1F7}",
        "fifa_code": "FRA",
        "group": "I",
        "confed": "UEFA"
    },
    {
        "name": "Senegal",
        "continent": "Africa",
        "flag_icon": "🇸🇳",
        "flag_unicode": "\\u{1F1F8}\\u{1F1F3}",
        "fifa_code": "SEN",
        "group": "I",
        "confed": "CAF"
    },
    {
        "name": "Iraq",
        "continent": "Asia",
        "flag_icon": "🇮🇶",
        "flag_unicode": "\\u{1F1EE}\\u{1F1F6}",
        "fifa_code": "IRQ",
        "group": "I",
        "confed": "AFC"
    },
    {
        "name": "Norway",
        "continent": "Europe",
        "flag_icon": "🇳🇴",
        "flag_unicode": "\\u{1F1F3}\\u{1F1F4}",
        "fifa_code": "NOR",
        "group": "I",
        "confed": "UEFA"
    },
    {
        "name": "Argentina",
        "continent": "South America",
        "flag_icon": "🇦🇷",
        "flag_unicode": "\\u{1F1E6}\\u{1F1F7}",
        "fifa_code": "ARG",
        "group": "J",
        "confed": "CONMEBOL"
    },
    {
        "name": "Algeria",
        "continent": "Africa",
        "flag_icon": "🇩🇿",
        "flag_unicode": "\\u{1F1E9}\\u{1F1FF}",
        "fifa_code": "ALG",
        "group": "J",
        "confed": "CAF"
    },
    {
        "name": "Austria",
        "continent": "Europe",
        "flag_icon": "🇦🇹",
        "flag_unicode": "\\u{1F1E6}\\u{1F1F9}",
        "fifa_code": "AUT",
        "group": "J",
        "confed": "UEFA"
    },
    {
        "name": "Jordan",
        "continent": "Asia",
        "flag_icon": "🇯🇴",
        "flag_unicode": "\\u{1F1EF}\\u{1F1F4}",
        "fifa_code": "JOR",
        "group": "J",
        "confed": "AFC"
    },
    {
        "name": "Portugal",
        "continent": "Europe",
        "flag_icon": "🇵🇹",
        "flag_unicode": "\\u{1F1F5}\\u{1F1F9}",
        "fifa_code": "POR",
        "group": "K",
        "confed": "UEFA"
    },
    {
        "name": "DR Congo",
        "name_normalised": "Congo DR",
        "continent": "Africa",
        "flag_icon": "🇨🇩",
        "flag_unicode": "\\u{1F1E8}\\u{1F1E9}",
        "fifa_code": "COD",
        "group": "K",
        "confed": "CAF"
    },
    {
        "name": "Uzbekistan",
        "continent": "Asia",
        "flag_icon": "🇺🇿",
        "flag_unicode": "\\u{1F1FA}\\u{1F1FF}",
        "fifa_code": "UZB",
        "group": "K",
        "confed": "AFC"
    },
    {
        "name": "Colombia",
        "continent": "South America",
        "flag_icon": "🇨🇴",
        "flag_unicode": "\\u{1F1E8}\\u{1F1F4}",
        "fifa_code": "COL",
        "group": "K",
        "confed": "CONMEBOL"
    },
    {
        "name": "England",
        "continent": "Europe",
        "flag_icon": "🏴",
        "flag_unicode": "\\u{1F3F4}\\u{E0067}\\u{E0062}\\u{E0065}\\u{E006E}\\u{E0067}\\u{E007F}",
        "fifa_code": "ENG",
        "group": "L",
        "confed": "UEFA"
    },
    {
        "name": "Croatia",
        "continent": "Europe",
        "flag_icon": "🇭🇷",
        "flag_unicode": "\\u{1F1ED}\\u{1F1F7}",
        "fifa_code": "CRO",
        "group": "L",
        "confed": "UEFA"
    },
    {
        "name": "Ghana",
        "continent": "Africa",
        "flag_icon": "🇬🇭",
        "flag_unicode": "\\u{1F1EC}\\u{1F1ED}",
        "fifa_code": "GHA",
        "group": "L",
        "confed": "CAF"
    },
    {
        "name": "Panama",
        "continent": "North America",
        "flag_icon": "🇵🇦",
        "flag_unicode": "\\u{1F1F5}\\u{1F1E6}",
        "fifa_code": "PAN",
        "group": "L",
        "confed": "CONCACAF"
    }
]

Your JSON is fine. The flags are definitely there.

That means the problem is almost certainly this function:

function normalizeText(value) {
  const text = String(value ?? "");
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}
This is an old Unicode hack and it often corrupts emoji characters, especially flag emojis (which are pairs of regional indicator symbols).

Because normalizeTeamKey() calls it:

function normalizeTeamKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
the lookup keys may not match what you think.

First debug step
Add this immediately after loadTeamMeta() finishes:

console.log("Mexico flag:", STATE.teams["mexico"]);
console.log("South Africa flag:", STATE.teams["southafrica"]);
console.log("South Korea flag:", STATE.teams["southkorea"]);
console.log("Czech Republic flag:", STATE.teams["czechrepublic"]);
If those print:

🇲🇽
🇿🇦
🇰🇷
🇨🇿
then the data is loading correctly.

Second debug step
Temporarily replace:

function getTeamFlag(teamName) {
  const key = normalizeTeamKey(teamName);
  return STATE.teams[key] || "🏳";
}
with:

function getTeamFlag(teamName) {
  const key = normalizeTeamKey(teamName);

  console.log(
    "FLAG LOOKUP:",
    teamName,
    "->",
    key,
    "->",
    STATE.teams[key]
  );

  return STATE.teams[key] || "🏳";
}
Open DevTools and inspect what is being returned.

What I suspect
The screenshot showing:

MX Mexico
ZA South Africa
KR South Korea
CZ Czech Republic
doesn't look like broken emoji rendering.

It looks like your CSS is turning the flag span into a tiny fixed-width badge and only displaying the country code fallback text.

Inspect one of the rendered elements.

If the HTML looks like:

<span class="team-flag">🇲🇽</span>
then it's a CSS/font problem.

If it looks like:

<span class="team-flag">MX</span>
then something else in your code is replacing the emoji with country codes before rendering.

The fastest answer now is to inspect one rendered flag in Chrome and tell me what the actual DOM contains:

<span class="team-flag"> ??? </span>
If it's 🇲🇽, I'll point you directly to the CSS rule causing the issue. If it's MX, I'll point you to the exact JavaScript path that's overwriting the flag data.


Mexico flag: undefined
app.js:863 South Africa flag: undefined
app.js:864 South Korea flag: undefined
app.js:865 Czech Republic flag: undefined
app.js:74 Firebase initialized

Perfect. That narrows it down immediately.

If:

Mexico flag: undefined
South Africa flag: undefined
South Korea flag: undefined
Czech Republic flag: undefined
then loadTeamMeta() is not loading your JSON at all, or it's loading an empty array.

Add this inside loadTeamMeta():

async function loadTeamMeta() {
  try {
    const response = await fetch("2026/worldcup.teams.json", {
      cache: "no-store",
    });

    console.log("Teams response:", response.status);

    const teams = await response.json();

    console.log("Teams loaded:", teams.length);
    console.log("First team:", teams[0]);

    STATE.teams = (teams || []).reduce((acc, team) => {
      const flag = team.flag_icon || "🏳";

      [team.name, team.name_normalised, team.fifa_code]
        .filter(Boolean)
        .forEach((key) => {
          acc[normalizeTeamKey(key)] = flag;
        });

      return acc;
    }, {});

    console.log("STATE.teams keys:", Object.keys(STATE.teams).slice(0, 10));
  } catch (error) {
    console.error("Team load failed:", error);
  }
}
Then check the console.

Likely outcomes
Case 1
Teams response: 404
Your file path is wrong.

Maybe:

2026/worldcup.teams.json
doesn't exist relative to the deployed page.

Case 2
Teams response: 200
Teams loaded: 0
The JSON file being served is empty.

Case 3
Teams response: 200
Teams loaded: 48
but

STATE.teams keys: []
Then the reduce logic isn't running because the JSON structure isn't an array at runtime.

Example:

{
  "teams": [...]
}
instead of:

[
  ...
]
Case 4
You get:

Failed to fetch
This is very common when opening the HTML directly:

file:///C:/...
instead of running through a web server.

fetch() cannot reliably load local JSON files from file://.

Open DevTools Network tab and look for:

worldcup.teams.json
Tell me:

Status code

Response URL

Whether you're running:

GitHub Pages

Firebase Hosting

Netlify

Local server

Double-clicking index.html

That will identify the exact failure in one step.


how can i add the 5 jsons in 2026/ to my firebase

If you're already using Firestore, the easiest approach is to upload the JSON files into Firestore collections rather than trying to store the JSON files themselves.

For example:

2026/worldcup.teams.json      → teams collection
2026/worldcup.json            → fixtures collection
2026/worldcup.groups.json     → groups collection
2026/worldcup.stadiums.json   → stadiums collection
2026/worldcup.cities.json     → cities collection
Option 1 — One-time browser import (fastest)
Create a temporary admin page:

async function importTeams() {
  const teams = await fetch("2026/worldcup.teams.json").then(r => r.json());

  const batch = db.batch();

  teams.forEach(team => {
    const ref = db.collection("teams").doc(team.fifa_code);
    batch.set(ref, team);
  });

  await batch.commit();
  console.log("Teams imported");
}
For fixtures:

async function importFixtures() {
  const fixtures = await fetch("2026/worldcup.json").then(r => r.json());

  const batch = db.batch();

  fixtures.matches.forEach(match => {
    const id = String(match.num);

    batch.set(
      db.collection("fixtures").doc(id),
      {
        matchId: id,
        ...match
      }
    );
  });

  await batch.commit();
}
Then run once from DevTools:

await importTeams();
await importFixtures();
Option 2 — Firebase Console (no code)
Convert each JSON array into newline-delimited JSON.

Use:

Firestore Database
→ Import/Export
However this usually requires Blaze billing and is more cumbersome.

Option 3 — Apps Script Importer (recommended)
Since you're already using Apps Script as a backend, create a one-time import function:

function importTeams() {
  const url =
    "https://your-site.com/2026/worldcup.teams.json";

  const teams = JSON.parse(
    UrlFetchApp.fetch(url).getContentText()
  );

  const db = FirestoreApp.getFirestore(
    PROJECT_ID,
    CLIENT_EMAIL,
    PRIVATE_KEY
  );

  teams.forEach(team => {
    db.createDocument(
      `teams/${team.fifa_code}`,
      team
    );
  });
}
Run once.

For your flag problem specifically
You don't actually need to put the teams JSON into Firestore.

The simpler fix is:

const response = await fetch("./2026/worldcup.teams.json");
and make sure the file is deployed.

Since your console shows:

Mexico flag: undefined
the first thing I'd check is whether:

https://your-site.com/2026/worldcup.teams.json
actually loads in the browser.

If it returns 404, the JSON isn't being deployed with the site, which would explain why all flags are missing. What hosting are you using—Firebase Hosting, GitHub Pages, Netlify, Vercel, or just opening index.html locally?

Improve accuracy for documents and research
Upgrade to Plus and use the latest Thinking model to synthesize documents, research, files, and complex information.

Try Plus free


