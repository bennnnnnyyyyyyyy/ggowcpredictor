// ── FIREBASE ───────────────────────────────────────────────────────────
// Firebase is loaded from CDN in index.html, using global firebase object

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAVBLnjdM4cV9vBwV27dl6bEc4ZqVjuFBw",
  authDomain: "ggowcpredictor.firebaseapp.com",
  projectId: "ggowcpredictor",
  storageBucket: "ggowcpredictor.firebasestorage.app",
  messagingSenderId: "126058028551",
  appId: "1:126058028551:web:e60b6e211c3e2e56e154a2",
  measurementId: "G-YQLEYQ386D"
};

let db = null;

try {
  const app = firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  console.log("✅ Firebase initialized successfully");
} catch (error) {
  console.warn("⚠️ Firebase initialization failed (may be offline):", error.message);
  console.log("Using fallback mock authentication");
}

// ── SESSION ──────────────────────────────────────────────────────────
const SESSION = {
  token: sessionStorage.getItem("ggo_wc_token") || null,
  username: sessionStorage.getItem("ggo_wc_user") || null,
  displayName: sessionStorage.getItem("ggo_wc_displayname") || null,
  isAdmin: sessionStorage.getItem("ggo_wc_admin") === "true",
};

// ── CONFIG (will be populated from settings / hardcoded before deploy) ──
const CONFIG = {
  appsScriptUrl: localStorage.getItem("ggo_wc_url") || "",
  apiKey: localStorage.getItem("ggo_wc_key") || "",
};

// ── STATE ────────────────────────────────────────────────────────────
const STATE = {
  fixtures: [], // all 104 fixtures (seeded)
  results: {}, // matchId → { score1, score2, status }
  predictions: {}, // matchId → { pred1, pred2, points }
  leaderboard: [],
  lastSync: null,
};

// ── INIT ─────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  if (SESSION.token && SESSION.username) {
    showApp();
  }
});

// ── LOGIN ────────────────────────────────────────────────────────────
async function handleLogin(event) {
  if (event) event.preventDefault();
  
  const username = document.getElementById("login-name").value.trim();
  const code = document.getElementById("login-code").value.trim();
  const errEl = document.getElementById("login-error");

  if (!username || !code) {
    errEl.textContent = "Please enter your name and code.";
    errEl.classList.add("show");
    return;
  }

  try {
    // Validate against Firestore if available
    if (db) {
      const userRef = firebase.firestore().collection("users").doc(username);
      const userSnap = await userRef.get();
      
      if (!userSnap.exists) {
        errEl.textContent = "User not found.";
        errEl.classList.add("show");
        return;
      }

      const userData = userSnap.data();
      if (userData.secretCode !== code) {
        errEl.textContent = "Invalid code. Try again.";
        errEl.classList.add("show");
        return;
      }

      // Login successful
      const token = btoa(username + ":" + Date.now());
      sessionStorage.setItem("ggo_wc_token", token);
      sessionStorage.setItem("ggo_wc_user", username);
      sessionStorage.setItem("ggo_wc_displayname", userData.displayName);
      sessionStorage.setItem("ggo_wc_admin", userData.isAdmin);

      SESSION.token = token;
      SESSION.username = username;
      SESSION.displayName = userData.displayName;
      SESSION.isAdmin = userData.isAdmin;

      errEl.classList.remove("show");
      showApp();
    } else {
      // Fallback: mock validation (for development/offline)
      const validUsers = {
        ben_arthur: { displayName: "Ben Arthur", isAdmin: true, code: "GGO2026" },
        jimmy: { displayName: "Jimmy", isAdmin: false, code: "GGO2026" },
        jane: { displayName: "Jane", isAdmin: false, code: "GGO2026" },
        selene: { displayName: "Selene", isAdmin: false, code: "GGO2026" }
      };

      const user = validUsers[username];
      if (!user || user.code !== code) {
        errEl.textContent = "Invalid name or code. Try again.";
        errEl.classList.add("show");
        return;
      }

      const token = btoa(username + ":" + Date.now());
      sessionStorage.setItem("ggo_wc_token", token);
      sessionStorage.setItem("ggo_wc_user", username);
      sessionStorage.setItem("ggo_wc_displayname", user.displayName);
      sessionStorage.setItem("ggo_wc_admin", user.isAdmin);

      SESSION.token = token;
      SESSION.username = username;
      SESSION.displayName = user.displayName;
      SESSION.isAdmin = user.isAdmin;

      errEl.classList.remove("show");
      showApp();
    }
  } catch (error) {
    console.error("Login error:", error);
    errEl.textContent = "Login failed. Please try again.";
    errEl.classList.add("show");
  }
}

function showApp() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display = "block";

  // Set user pill
  const initials = (SESSION.displayName || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  document.getElementById("user-avatar").textContent = initials;
  document.getElementById("user-display-name").textContent =
    SESSION.displayName || SESSION.username;

  // Show admin nav if applicable
  if (SESSION.isAdmin) {
    document.getElementById("admin-nav-btn").style.display = "";
  }

  requestSync();
}

function handleLogout() {
  sessionStorage.clear();
  location.reload();
}

// ── VIEW SWITCHER ────────────────────────────────────────────────────
function showView(id, btn) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("view-" + id).classList.add("active");
  if (btn) btn.classList.add("active");
}

// ── SYNC ─────────────────────────────────────────────────────────────
async function requestSync() {
  const dot = document.getElementById("sync-dot");
  const timeEl = document.getElementById("last-sync-time");
  const syncBtn = document.querySelector(".sync-btn");

  dot.className = "status-dot loading";
  timeEl.textContent = "Syncing…";
  syncBtn.classList.add("loading");

  try {
    // Load fixtures from Firestore
    if (db) {
      const fixturesSnap = await db.collection("fixtures").get();
      STATE.fixtures = fixturesSnap.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      }));
      
      // Load user's predictions
      const predsSnap = await db
        .collection("predictions")
        .where("username", "==", SESSION.username)
        .get();
      
      predsSnap.forEach((doc) => {
        const pred = doc.data();
        STATE.predictions[pred.matchId] = pred;
      });

      // Load leaderboard
      const leaderboardSnap = await db.collection("leaderboard").doc("current").get();
      if (leaderboardSnap.exists) {
        STATE.leaderboard = leaderboardSnap.data().players || [];
      }
    }

    STATE.lastSync = new Date();
    dot.className = "status-dot active";
    timeEl.textContent =
      "Live · " +
      STATE.lastSync.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    renderPredictions();
    renderGroupStandings();
    renderLeaderboard();
  } catch (e) {
    dot.className = "status-dot";
    timeEl.textContent = "Sync failed";
    console.error("Sync error:", e);
  }

  syncBtn.classList.remove("loading");
}

// ── SAVE PREDICTION ──────────────────────────────────────────────────
async function savePrediction(matchId, pred1, pred2) {
  if (!db) {
    STATE.predictions[matchId] = { matchId, pred1: parseInt(pred1), pred2: parseInt(pred2), username: SESSION.username };
    renderGroupStandings();
    return;
  }

  const docId = `${SESSION.username}_${matchId}`;
  try {
    await db.collection("predictions").doc(docId).set({
      matchId,
      username: SESSION.username,
      pred1: parseInt(pred1),
      pred2: parseInt(pred2),
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    STATE.predictions[matchId] = { matchId, pred1: parseInt(pred1), pred2: parseInt(pred2) };
    renderGroupStandings();
  } catch (error) {
    console.error("Error saving prediction:", error);
  }
}

// ── RENDER STUBS (filled in Phase 2) ────────────────────────────────
function renderPredictions() {
  // Group fixtures by group
  const byGroup = {};
  STATE.fixtures.forEach((f) => {
    if (!byGroup[f.group]) byGroup[f.group] = [];
    byGroup[f.group].push(f);
  });

  const el = document.getElementById("predictions-list");
  if (STATE.fixtures.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>Fixtures will load here. Each match card has score inputs and a countdown.</p>
      </div>`;
    return;
  }

  let html = "";
  for (const [groupName, fixtures] of Object.entries(byGroup)) {
    html += `<div class="group-section"><h3>${groupName}</h3>`;
    html += fixtures
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
              onchange="savePrediction('${match.matchId}', this.value, document.querySelector('[data-matchid=\"${match.matchId}\"][data-team=\"2\"]').value)"
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
              onchange="savePrediction('${match.matchId}', document.querySelector('[data-matchid=\"${match.matchId}\"][data-team=\"1\"]').value, this.value)"
              placeholder="0"
            />
          </div>
        </div>
      </div>
    `;
        }
      )
      .join("");
    html += "</div>";
  }

  el.innerHTML = html;
}

function renderGroupStandings() {
  const container = document.getElementById("group-standings");
  if (!container) return;

  const GroupStandings = class {
    constructor(groupName, teams) {
      this.groupName = groupName;
      this.standings = teams.map((team) => ({
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
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
  };

  const GROUPS = {
    "Group A": ["Mexico", "South Africa", "South Korea", "Czech Republic"],
    "Group B": ["Canada", "Bosnia & Herzegovina", "Qatar", "Switzerland"],
    "Group C": ["Brazil", "Morocco", "Haiti", "Scotland"],
    "Group D": ["USA", "Paraguay", "Australia", "Turkey"],
    "Group E": ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
    "Group F": ["Netherlands", "Senegal", "Tunisia", "Jamaica"],
    "Group G": ["Belgium", "Croatia", "France", "Portugal"],
    "Group H": ["Italy", "Spain", "Switzerland", "Poland"],
    "Group I": ["Argentina", "Uzbekistan", "Paraguay", "Bolivia"],
    "Group J": ["England", "Iran", "Wales", "Costa Rica"],
    "Group K": ["Japan", "Spain", "Germany", "Costa Rica"],
    "Group L": ["Russia", "Belgium", "Wales", "Iran"],
  };

  let html = "";

  for (const [groupName, teams] of Object.entries(GROUPS)) {
    const standings = new GroupStandings(groupName, teams);

    const groupMatches = STATE.fixtures.filter(
      (m) => m.group === groupName
    );

    groupMatches.forEach((match) => {
      const pred = STATE.predictions[match.matchId];
      if (pred) {
        standings.addMatch(match.team1, match.team2, pred.pred1, pred.pred2);
      }
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

// ── FILTER STUBS ─────────────────────────────────────────────────────
function filterMatches(type, btn) {
  document
    .querySelectorAll("#view-predictions .filter-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  // TODO: filter STATE.fixtures and re-render
}

function filterResults(type, btn) {
  document
    .querySelectorAll("#view-results .filter-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  // TODO: filter STATE.results and re-render
}

// ── SETTINGS ─────────────────────────────────────────────────────────
function toggleSettings(show) {
  const modal = document.getElementById("settings-modal");
  if (show) {
    document.getElementById("setting-api-url").value = CONFIG.appsScriptUrl;
    document.getElementById("setting-api-key").value = CONFIG.apiKey;
    modal.classList.add("active");
  } else {
    modal.classList.remove("active");
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
