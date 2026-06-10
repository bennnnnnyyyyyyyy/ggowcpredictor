// ── FIREBASE ───────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, where } from "firebase/firestore";

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
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
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

  // Enter key on code input
  document.getElementById("login-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
});

// ── LOGIN ────────────────────────────────────────────────────────────
async function handleLogin() {
  const username = document.getElementById("login-name").value.trim();
  const code = document.getElementById("login-code").value.trim();
  const errEl = document.getElementById("login-error");

  if (!username || !code) {
    errEl.textContent = "Please select your name and enter your code.";
    errEl.classList.add("show");
    return;
  }

  try {
    // Validate against Firestore if available
    if (db) {
      const userRef = doc(db, "users", username);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
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
      // Fallback: mock validation (for development)
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
    // TODO: replace stub with real fetch to Apps Script / Firebase
    await new Promise((r) => setTimeout(r, 800)); // simulate

    STATE.lastSync = new Date();
    dot.className = "status-dot active";
    timeEl.textContent =
      "Live · " +
      STATE.lastSync.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    renderPredictions();
    renderLeaderboard();
    renderResults();
    renderBracket();
  } catch (e) {
    dot.className = "status-dot";
    timeEl.textContent = "Sync failed";
    console.error("Sync error:", e);
  }

  syncBtn.classList.remove("loading");
}

// ── RENDER STUBS (filled in Phase 2) ────────────────────────────────
function renderPredictions() {
  const el = document.getElementById("predictions-list");
  if (STATE.fixtures.length === 0) {
    el.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <p>Fixtures will load here once the backend is connected.<br>
            Each match card will have score inputs, a countdown, and a lock indicator.</p>
          </div>`;
    return;
  }
  // TODO: render fixture cards with pred-inputs
}

function renderLeaderboard() {
  const tbody = document.getElementById("leaderboard-body");
  if (STATE.leaderboard.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted);font-family:'DM Sans',sans-serif">No predictions scored yet.</td></tr>`;
    return;
  }
  // TODO: render leaderboard rows
}

function renderResults() {
  const el = document.getElementById("results-list");
  if (Object.keys(STATE.results).length === 0) {
    el.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚽</div>
            <p>Results will appear here once matches kick off.<br>
            Live scores update every 60 seconds via API-Football.</p>
          </div>`;
    return;
  }
  // TODO: render result cards
}

function renderBracket() {
  // TODO: render knockout bracket from STATE
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
