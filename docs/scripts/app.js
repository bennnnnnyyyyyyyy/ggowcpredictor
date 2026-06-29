// GGO WC 2026 Predictor - browser app

const firebaseConfig = {
  apiKey: "AIzaSyAVBLnjdM4cV9vBwV27dl6bEc4ZqVjuFBw",
  authDomain: "ggowcpredictor.firebaseapp.com",
  projectId: "ggowcpredictor",
  storageBucket: "ggowcpredictor.firebasestorage.app",
  messagingSenderId: "126058028551",
  appId: "1:126058028551:web:e60b6e211c3e2e56e154a2",
  measurementId: "G-YQLEYQ386D",
};

const supabaseConfig = {
  url: "https://nthnysznieivbkncpqrk.supabase.co",
  key: "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo",
};

function supabaseHeaders(extra = {}) {
  return Object.assign(
    {
      apikey: supabaseConfig.key,
      Authorization: `Bearer ${supabaseConfig.key}`,
    },
    extra,
  );
}

function getSupabaseUrl(table, query = "") {
  const base = supabaseConfig.url.replace(/\/$/, "");
  const suffix = query ? `?${query}` : "";
  return `${base}/rest/v1/${table}${suffix}`;
}
async function supabaseSelect(table, selectQuery = "*", extraQuery = "") {
  let query = `select=${encodeURIComponent(selectQuery)}`;
  if (extraQuery) {
    query += `&${extraQuery}`;
  }
  const url = getSupabaseUrl(table, query);
  const response = await fetch(url, {
    headers: supabaseHeaders({
      "Range-Unit": "items",
      Range: "0-9999",
    }),
  });
  if (!response.ok) {
    throw new Error(`Supabase GET ${table} HTTP ${response.status}`);
  }
  return response.json();
}
async function supabaseUpsert(table, rows, conflictKey) {
  if (!rows || (Array.isArray(rows) && !rows.length)) return;
  const query = conflictKey
    ? `on_conflict=${encodeURIComponent(conflictKey)}`
    : "";
  const response = await fetch(getSupabaseUrl(table, query), {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Supabase upsert ${table} HTTP ${response.status}: ${text}`,
    );
  }
}

const DEMO_USERS = {
  ben_arthur: { displayName: "Ben Arthur", isAdmin: true, code: "GGO2026" },
  jimmy: { displayName: "Jimmy", isAdmin: false, code: "GGO2026" },
  jane: { displayName: "Jane", isAdmin: false, code: "GGO2026" },
  selene: { displayName: "Selene", isAdmin: false, code: "GGO2026" },
};

let db = null;
let activeMatchFilter = "all";
let activeResultFilter = "all";
let savingMatchId = null; // or new Set() if multiple saves are allowed
const THIRD_PLACE_SLOT_ORDER = [
  "3A/B/C/D/F", // best
  "3C/D/F/G/H", // 2nd
  "3C/E/F/H/I", // 3rd
  "3E/H/I/J/K", // 4th
  "3B/E/F/I/J", // 5th
  "3A/E/H/I/J", // 6th
  "3E/F/G/I/J", // 7th
  "3D/E/I/J/L", // 8th
];

// ── Static R32 seed map — real teams confirmed from group stage draw ──
// Overrides bad/stale API team values for R32 fixtures before rendering.
// R16+ slots (W73, W74…) auto-resolve via resolveSlot once results exist.
const R32_SEED_MAP = {
  73: { team1: "South Africa", team2: "Canada" },
  74: { team1: "Brazil", team2: "Japan" },
  75: { team1: "Germany", team2: "Paraguay" },
  76: { team1: "Netherlands", team2: "Morocco" },
  77: { team1: "Ivory Coast", team2: "Norway" },
  78: { team1: "France", team2: "Sweden" },
  79: { team1: "Mexico", team2: "Ecuador" },
  80: { team1: "England", team2: "DR Congo" },
  81: { team1: "USA", team2: "Bosnia & Herzegovina" },
  82: { team1: "Belgium", team2: "Senegal" },
  83: { team1: "Portugal", team2: "Croatia" },
  84: { team1: "Spain", team2: "Austria" },
  85: { team1: "Switzerland", team2: "Algeria" },
  86: { team1: "Argentina", team2: "Cape Verde" },
  87: { team1: "Colombia", team2: "Ghana" },
  88: { team1: "Australia", team2: "Egypt" },
};
const SESSION = {
  token: localStorage.getItem("ggo_wc_token") || null,
  username: localStorage.getItem("ggo_wc_user") || null,
  displayName: localStorage.getItem("ggo_wc_displayname") || null,
  isAdmin: localStorage.getItem("ggo_wc_admin") === "true",
};
window.SESSION = SESSION;
const CONFIG = {
  appsScriptUrl: localStorage.getItem("ggo_wc_url") || "http://localhost:8787",

  apiKey: localStorage.getItem("ggo_wc_key") || "",

  get workerUrl() {
    return this.appsScriptUrl;
  },

  get seedToken() {
    return this.apiKey;
  },
};

const STATE = {
  fixtures: [],
  results: {},
  predictions: {},
  allPredictions: {},
  leaderboard: [],
  groupStandings: {},
  users: [],
  accountRequests: [],
  teams: {},
  lastSync: null,
};

const STADIUMS_BY_GROUND = {
  Atlanta: {
    city: "Atlanta",
    stadium: "Mercedes-Benz Stadium",
    timeZone: "America/New_York",
  },
  Boston: {
    city: "Foxborough",
    stadium: "Gillette Stadium",
    timeZone: "America/New_York",
  },
  Dallas: {
    city: "Arlington",
    stadium: "AT&T Stadium",
    timeZone: "America/Chicago",
  },
  "Guadalajara (Zapopan)": {
    city: "Zapopan",
    stadium: "Estadio Akron",
    timeZone: "America/Mexico_City",
  },
  Houston: {
    city: "Houston",
    stadium: "NRG Stadium",
    timeZone: "America/Chicago",
  },
  "Kansas City": {
    city: "Kansas City",
    stadium: "Arrowhead Stadium",
    timeZone: "America/Chicago",
  },
  "Los Angeles (Inglewood)": {
    city: "Inglewood",
    stadium: "SoFi Stadium",
    timeZone: "America/Los_Angeles",
  },
  "Mexico City": {
    city: "Mexico City",
    stadium: "Estadio Azteca",
    timeZone: "America/Mexico_City",
  },
  Miami: {
    city: "Miami Gardens",
    stadium: "Hard Rock Stadium",
    timeZone: "America/New_York",
  },
  "Monterrey (Guadalupe)": {
    city: "Guadalupe",
    stadium: "Estadio BBVA",
    timeZone: "America/Monterrey",
  },
  "New York New Jersey": {
    city: "East Rutherford",
    stadium: "MetLife Stadium",
    timeZone: "America/New_York",
  },
  "New York/New Jersey (East Rutherford)": {
    city: "East Rutherford",
    stadium: "MetLife Stadium",
    timeZone: "America/New_York",
  },
  Philadelphia: {
    city: "Philadelphia",
    stadium: "Lincoln Financial Field",
    timeZone: "America/New_York",
  },
  "San Francisco Bay Area (Santa Clara)": {
    city: "Santa Clara",
    stadium: "Levi's Stadium",
    timeZone: "America/Los_Angeles",
  },
  Seattle: {
    city: "Seattle",
    stadium: "Lumen Field",
    timeZone: "America/Los_Angeles",
  },
  Toronto: {
    city: "Toronto",
    stadium: "BMO Field",
    timeZone: "America/Toronto",
  },
  Vancouver: {
    city: "Vancouver",
    stadium: "BC Place",
    timeZone: "America/Vancouver",
  },
};
window.addEventListener("DOMContentLoaded", async () => {
  initFirebase();

  const hasSession = SESSION.token && SESSION.username;
  if (hasSession) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app").style.display = "block";

    const initials = getInitials(
      SESSION.displayName || SESSION.username || "?",
    );
    const avatarEl = document.getElementById("user-avatar");
    if (avatarEl) avatarEl.textContent = initials;
    const nameEl = document.getElementById("user-display-name");
    if (nameEl) nameEl.textContent = SESSION.displayName || SESSION.username;

    const profileLink = document.getElementById("user-profile-link");
    if (profileLink && SESSION.username) {
      profileLink.href = `profile.html?user=${encodeURIComponent(SESSION.username)}`;
    }
  }

  await loadTeamMeta();
  await hydrateLoginUsers();

  if (hasSession) {
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMatchDrawer();
  });
});
const wcTeamColors = {
  // 📺 Teams in your current fixtures
  Scotland: "#004B84", // Dark Blue
  Brazil: "#FFDC02", // Yellow
  Morocco: "#C1272D", // Red
  Haiti: "#00209F", // Blue
  "Czech Republic": "#ED1B24", // Red
  Mexico: "#006341", // Green
  "South Africa": "#FFB81C", // Gold (Pops better than dark green)
  "South Korea": "#C20E1A", // Red
  Curaçao: "#002B7F", // Blue
  "Ivory Coast": "#FF8200", // Orange
  Ecuador: "#FFD100", // Yellow
  Germany: "#FFCE00", // Gold (Black blends into dark mode)

  // 🇺🇸🇨🇦🇲🇽 Hosts
  USA: "#BF0A30", // Red
  Canada: "#FF0000", // Red

  // 🌍 Europe (UEFA)
  France: "#002395", // Blue
  England: "#CE1124", // Red (White is too stark for bars)
  Spain: "#AA151B", // Red
  Italy: "#0064AA", // Azure Blue
  Netherlands: "#F36C21", // Orange
  Portugal: "#E42518", // Red
  Belgium: "#E30613", // Red
  Croatia: "#ED1C24", // Red
  Switzerland: "#FF0000", // Red
  Denmark: "#C60C30", // Red
  Sweden: "#FECC00", // Yellow
  Wales: "#D30731", // Red
  Poland: "#DC143C", // Crimson
  Serbia: "#C6363C", // Red
  Turkey: "#E30A17", // Red

  // 🌎 South America (CONMEBOL)
  Argentina: "#43A1D5", // Light Blue
  Uruguay: "#55B5E5", // Light Blue
  Colombia: "#FCD116", // Yellow
  Peru: "#D91023", // Red
  Chile: "#D52B1E", // Red

  // 🌏 Asia (AFC)
  Japan: "#000555", // Samurai Blue
  Australia: "#FFCD00", // Gold
  Iran: "#239F40", // Green
  "Saudi Arabia": "#006C35", // Green
  Qatar: "#8A1538", // Maroon

  // 🌍 Africa (CAF)
  Senegal: "#00853F", // Green
  Nigeria: "#008751", // Green
  Algeria: "#006233", // Green
  Egypt: "#CE1126", // Red
  Ghana: "#006B3F", // Green
  Cameroon: "#007A5E", // Green

  // 🌎 North/Central America (CONCACAF)
  "Costa Rica": "#CE1126", // Red
  Panama: "#C8102E", // Red
  Jamaica: "#FED100", // Yellow
};
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

  let loaded = false;

  // 1. Try Supabase
  try {
    const data = await supabaseSelect("users");
    if (data && data.length) {
      STATE.users = data.map((u) => ({
        username: u.username || u.id,
        displayName: u.displayName || u.username || u.id,
        isAdmin: Boolean(u.isAdmin),
      }));
      loaded = true;
    }
  } catch (error) {
    console.warn("Could not load Supabase users.", error.message);
  }

  // 2. Try Firestore
  if (!loaded && db) {
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

  renderUsernameOptions();
  filterUsernameOptions(document.getElementById("login-name")?.value || "");
}

async function handleLogin(event) {
  if (event) event.preventDefault();

  const username = normalizeUsername(
    document.getElementById("login-name").value,
  );
  const code = document.getElementById("login-code").value.trim();
  const errEl = document.getElementById("login-error");

  if (!username || !code) {
    showLoginError("Please enter your username and secret code.");
    return;
  }

  try {
    let userData = null;

    // 1. Supabase
    try {
      const data = await supabaseSelect(
        "users",
        "username,displayName,secretCode,isAdmin",
        `username=eq.${encodeURIComponent(username)}`,
      );
      if (data && data.length) {
        userData = {
          displayName: data[0].displayName || username,
          secretCode: data[0].secretCode || "",
          isAdmin: Boolean(data[0].isAdmin),
        };
      }
    } catch (error) {
      console.warn("Could not authenticate with Supabase.", error.message);
    }

    // 2. Firestore SDK
    if (!userData && db) {
      const userSnap = await db.collection("users").doc(username).get();
      if (userSnap.exists) userData = userSnap.data();
    }

    // 3. Firestore REST fallback (SDK not loaded)
    if (!userData) {
      try {
        const restUrl = `https://firestore.googleapis.com/v1/projects/ggowcpredictor/databases/(default)/documents/users/${encodeURIComponent(username)}`;
        const resp = await fetch(restUrl);
        if (resp.ok) {
          const doc = await resp.json();
          if (doc.fields) {
            userData = {
              displayName: doc.fields.displayName?.stringValue || username,
              secretCode: doc.fields.secretCode?.stringValue || "",
              isAdmin: doc.fields.isAdmin?.booleanValue || false,
            };
          }
        }
      } catch (_) {}
    }

    // 4. Demo users last resort
    if (!userData && DEMO_USERS[username]) {
      userData = {
        displayName: DEMO_USERS[username].displayName,
        secretCode: DEMO_USERS[username].code,
        isAdmin: DEMO_USERS[username].isAdmin,
      };
    }

    if (!userData) {
      showLoginError(
        "User not found. Request access or ask an admin to approve your username.",
      );
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
    localStorage.setItem("ggo_wc_token", SESSION.token);
    localStorage.setItem("ggo_wc_user", SESSION.username);
    localStorage.setItem("ggo_wc_displayname", SESSION.displayName);
    localStorage.setItem("ggo_wc_admin", String(SESSION.isAdmin));

    errEl.classList.remove("show");
    showApp();
  } catch (error) {
    console.error("Login error:", error);
    showLoginError("Login failed. Check your connection and try again.");
  }
}
function renderUsernameOptions() {
  const list = document.getElementById("username-options");
  if (!list) return;

  const usernames = STATE.users
    .map((user) => user.username)
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)));

  list.innerHTML = usernames
    .map((username) => `<option value="${escapeHtml(username)}"></option>`)
    .join("");
}

function filterUsernameOptions(query) {
  const suggestions = document.getElementById("username-suggestions");
  if (!suggestions) return;

  const term = String(query || "")
    .trim()
    .toLowerCase();
  const usernames = STATE.users
    .map((user) => user.username)
    .filter(Boolean)
    .filter((username) => username.toLowerCase().includes(term))
    .slice(0, 8);

  if (!term || !usernames.length) {
    suggestions.innerHTML = "";
    suggestions.hidden = true;
    return;
  }

  suggestions.innerHTML = usernames
    .map(
      (username) => `
        <button type="button" class="username-suggestion" onclick="chooseUsername('${escapeHtml(username)}')">
          ${escapeHtml(username)}
        </button>
      `,
    )
    .join("");
  suggestions.hidden = false;
}

function chooseUsername(username) {
  const input = document.getElementById("login-name");
  const suggestions = document.getElementById("username-suggestions");
  if (input) input.value = username;
  if (suggestions) {
    suggestions.innerHTML = "";
    suggestions.hidden = true;
  }
  document.getElementById("login-code")?.focus();
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_.]/g, ""); // keep dots
}
function toggleAccountRequest(show) {
  const modal = document.getElementById("account-request-modal");
  if (!modal) return;
  if (show) {
    modal.classList.add("show");
    return;
  }
  modal.classList.remove("show");
  const form = document.getElementById("account-request-form");
  if (form) form.reset();
}

async function submitAccountRequest(event) {
  if (event) event.preventDefault();

  const displayName = document
    .getElementById("request-display-name")
    .value.trim();
  const rawUsername = document.getElementById("request-username").value.trim();
  const email = document.getElementById("request-email").value.trim();
  const note = document.getElementById("request-note").value.trim();
  const username = normalizeUsername(rawUsername);

  if (!displayName || !username || !email) {
    showLoginError("Please enter your display name, username, and email.");
    return;
  }

  try {
    // Check if user exists in Supabase or Firestore
    let userExists = false;
    try {
      const users = await supabaseSelect(
        "users",
        "username",
        `username=eq.${encodeURIComponent(username)}`,
      );
      if (users && users.length) userExists = true;
    } catch (e) {
      if (db) {
        const userSnap = await db.collection("users").doc(username).get();
        if (userSnap.exists) userExists = true;
      }
    }

    if (userExists) {
      showLoginError("That username is already approved. Try logging in.");
      return;
    }

    // Check if pending request exists in Supabase or Firestore
    let requestExists = false;
    let existingRequest = null;
    try {
      const requests = await supabaseSelect(
        "accountRequests",
        "status",
        `username=eq.${encodeURIComponent(username)}`,
      );
      if (requests && requests.length) {
        requestExists = true;
        existingRequest = requests[0];
      }
    } catch (e) {
      if (db) {
        const reqSnap = await db
          .collection("accountRequests")
          .doc(username)
          .get();
        if (reqSnap.exists) {
          requestExists = true;
          existingRequest = reqSnap.data();
        }
      }
    }

    if (
      requestExists &&
      existingRequest &&
      existingRequest.status === "pending"
    ) {
      showLoginError("That request is already pending approval.");
      return;
    }

    const row = {
      username,
      displayName,
      email,
      note,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    let saved = false;

    // Save to Supabase
    try {
      await supabaseUpsert("accountRequests", [row], "username");
      saved = true;
    } catch (error) {
      console.warn("Could not send request to Supabase.", error.message);
    }

    // Save to Firestore
    if (db) {
      try {
        await db.collection("accountRequests").doc(username).set(
          {
            username,
            displayName,
            email,
            note,
            status: "pending",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        saved = true;
      } catch (error) {
        console.error("Could not send request to Firestore.", error);
      }
    }

    if (!saved) {
      throw new Error("Could not save request to either database.");
    }

    toggleAccountRequest(false);
    showToast("Request sent. An admin will review it soon.");

    // --- Notify admin via Worker ---
    try {
      const workerUrl =
        CONFIG.workerUrl.replace(/\/$/, "") + "/admin/new-request";
      const resp = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          displayName,
          email,
          note,
        }),
      });
      if (!resp.ok) {
        console.warn(
          "Admin notification HTTP error:",
          resp.status,
          await resp.text(),
        );
      }
    } catch (e) {
      console.warn("Admin notification network error (non‑critical):", e);
    }
  } catch (error) {
    console.error("Account request failed:", error);
    showLoginError(
      "Could not send request. Check your connection and try again.",
    );
  }
} // <-- THIS CLOSES THE FUNCTION

function showLoginError(message) {
  const errEl = document.getElementById("login-error");
  errEl.textContent = message;
  errEl.classList.add("show");
}
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = "toast";
  if (type) toast.classList.add(type); // 'success', 'error', 'warning'
  toast.style.display = "block";
  toast.style.opacity = "1";

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.style.display = "none";
    }, 300);
  }, 4000);
}
function setRulesIntroVisible(show, message) {
  const banner = document.getElementById("rules-intro-banner");
  const messageEl = document.getElementById("rules-intro-message");
  if (!banner || !messageEl) return;

  banner.hidden = !show;
  if (!show) return;

  messageEl.textContent =
    message ||
    `Welcome, ${SESSION.displayName || SESSION.username || "Employee"}. Review the Rules tab before making predictions.`;
}

function showApp() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display = "block";

  const initials = getInitials(SESSION.displayName || SESSION.username || "?");
  document.getElementById("user-avatar").textContent = initials;
  document.getElementById("user-display-name").textContent =
    SESSION.displayName || SESSION.username;

  // Point the header profile link to the logged-in user's profile page
  const profileLink = document.getElementById("user-profile-link");
  if (profileLink && SESSION.username) {
    profileLink.href = `profile.html?user=${encodeURIComponent(SESSION.username)}`;
  }

  ensureAdminNav();

  const calendarBtn = document.getElementById("calendar-nav-btn");
  if (calendarBtn) calendarBtn.style.display = "inline-block";

  const rulesKey = SESSION.username && `ggo_wc_rules_shown_${SESSION.username}`;
  const shouldShowRulesIntro = rulesKey && !localStorage.getItem(rulesKey);
  if (shouldShowRulesIntro) {
    const rulesBtn = document.getElementById("rules-nav-btn");
    showView("rules", rulesBtn);
    setRulesIntroVisible(
      true,
      `Welcome, ${SESSION.displayName || SESSION.username || "Employee"}. Review the Rules tab before making predictions.`,
    );
    localStorage.setItem(rulesKey, "true");
  } else {
    setRulesIntroVisible(false);
  }

  showNavChangeBanner();
  requestSync();
}

function handleLogout() {
  localStorage.removeItem("ggo_wc_token");
  localStorage.removeItem("ggo_wc_user");
  localStorage.removeItem("ggo_wc_displayname");
  localStorage.removeItem("ggo_wc_admin");
  window.location.reload();
}

function showView(id, btn) {
  // Calendar is modal-only, no view div
  if (id === "calendar") {
    toggleCalendarModal(true);
    return;
  }

  const currentView = document.querySelector(".view.active");
  const nextView = document.getElementById(`view-${id}`);

  if (!nextView || currentView === nextView) return;

  document.querySelectorAll(".nav-btn").forEach((navBtn) => {
    navBtn.classList.remove("active");
  });

  if (btn) btn.classList.add("active");

  if (currentView) {
    currentView.classList.remove("active");
  }

  nextView.classList.add("active");
  nextView.classList.remove("animating-in");

  // Restart animation
  void nextView.offsetWidth;

  nextView.classList.add("animating-in");

  if (id === "home") renderHome();
  if (id === "results") renderResults();
  if (id === "bracket") renderBracket();
  if (id === "standings") renderGroupStandings();
  if (id === "leaderboard") renderLeaderboard();
  if (id === "calendar") toggleCalendarModal(true);
  if (id === "admin") renderAdmin();
}

function getLocalDateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getFixtureDateKey(fixture) {
  if (
    fixture?.kickoffDate instanceof Date &&
    !Number.isNaN(fixture.kickoffDate.getTime())
  ) {
    return getLocalDateKey(fixture.kickoffDate);
  }
  if (fixture?.date) return String(fixture.date).slice(0, 10);
  return "";
}

function getTodayFixtures() {
  const today = getLocalDateKey();
  return (STATE.fixtures || [])
    .filter((fixture) => getFixtureDateKey(fixture) === today)
    .sort(
      (a, b) =>
        (a.kickoffDate?.getTime?.() || 0) - (b.kickoffDate?.getTime?.() || 0),
    );
}
// add after getTodayFixtures():
// REPLACE lines 873-892 with:
function getHomeWindowFixtures() {
  const now = new Date();

  // "Yesterday" boundary: noon today local time
  // TO:
  const noonToday = new Date(now);
  noonToday.setUTCHours(12, 0, 0, 0);

  const todayKey = getLocalDateKey(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = getLocalDateKey(yesterday);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = getLocalDateKey(tomorrow);

  const buckets = { yesterday: [], today: [], tomorrow: [] };

  (STATE.fixtures || []).forEach((fixture) => {
    const key = getFixtureDateKey(fixture);
    const kickoff = fixture.kickoffDate;

    if (key === yesterdayKey) {
      buckets.yesterday.push(fixture);
    } else if (key === todayKey) {
      // AM games (before noon local) slide into "yesterday"
      if (kickoff instanceof Date && kickoff < noonToday) {
        buckets.yesterday.push(fixture);
      } else {
        buckets.today.push(fixture);
      }
    } else if (key === tomorrowKey) {
      buckets.tomorrow.push(fixture);
    }
  });

  const byKickoff = (a, b) =>
    (a.kickoffDate?.getTime?.() || 0) - (b.kickoffDate?.getTime?.() || 0);
  buckets.yesterday.sort(byKickoff);
  buckets.today.sort(byKickoff);
  buckets.tomorrow.sort(byKickoff);
  return buckets;
}
function getMatchStatusInfo(fixture) {
  const result = STATE.results?.[fixture.matchId];
  const status = String(result?.status || "").toUpperCase();
  if (["NS", "NOT_STARTED", "TBD", ""].includes(status)) {
    const started =
      fixture.kickoffDate instanceof Date &&
      Date.now() >= fixture.kickoffDate.getTime();
    return started
      ? { label: "Live", cssClass: "status-live" }
      : { label: "Upcoming", cssClass: "status-upcoming" };
  }
  if (["FT", "AET", "PEN", "FINISHED", "ENDED"].includes(status))
    return { label: "Finished", cssClass: "status-finished" };
  return { label: "Live", cssClass: "status-live" };
}
function getUserDisplayName(username) {
  const found = STATE.users.find((user) => user.username === username);
  return found?.displayName || username || "Player";
}

function getPredictionOutcome(pred1, pred2) {
  if (pred1 > pred2) return "home";
  if (pred2 > pred1) return "away";
  return "draw";
}

function renderHome() {
  const summary = document.getElementById("home-summary-stats");
  const matchCards = document.getElementById("home-today-games");
  const winBar = document.getElementById("home-win-bar");
  const count = document.getElementById("today-match-count");
  if (!summary || !matchCards || !winBar || !count) return;

  const windowBuckets = getHomeWindowFixtures();
  const fixtures = [
    ...windowBuckets.yesterday,
    ...windowBuckets.today,
    ...windowBuckets.tomorrow,
  ];
  const todayIds = new Set(fixtures.map((fixture) => String(fixture.matchId)));
  const sourcePredictions = Object.keys(STATE.allPredictions || {}).length
    ? STATE.allPredictions
    : STATE.predictions;
  const predictions = Object.values(sourcePredictions || {}).filter(
    (prediction) =>
      hasPrediction(prediction) && todayIds.has(String(prediction.matchId)),
  );

  const groupedByMatch = new Map();
  const winSplit = { home: 0, draw: 0, away: 0 };

  predictions.forEach((prediction) => {
    const matchId = String(prediction.match_id ?? prediction.matchId);
    const list = groupedByMatch.get(matchId) || [];
    list.push(prediction);
    groupedByMatch.set(matchId, list);
    winSplit[getPredictionOutcome(prediction.pred1, prediction.pred2)] += 1;
  });

  const totalPredictions = predictions.length;
  const topOutcome = Object.entries(winSplit).sort(
    (a, b) => b[1] - a[1],
  )[0] || ["draw", 0];

  summary.innerHTML = [
    `<div class="hero-metric"><span class="hero-metric-label">Matches in window</span><strong>${fixtures.length}</strong></div>`,
    `<div class="hero-metric"><span class="hero-metric-label">Predictions tracked</span><strong>${totalPredictions}</strong></div>`,
  ].join("");
  count.textContent = `${fixtures.length} match${fixtures.length === 1 ? "" : "es"}`;

  const buildScoreGroups = (matchPreds) => {
    const buckets = new Map();
    matchPreds.forEach((prediction) => {
      const key = `${prediction.pred1}-${prediction.pred2}`;
      const bucket = buckets.get(key) || { score: key, count: 0, users: [] };
      bucket.count += 1;
      bucket.users.push(getUserDisplayName(prediction.username));
      buckets.set(key, bucket);
    });
    return [...buckets.values()].sort(
      (a, b) => b.count - a.count || a.score.localeCompare(b.score),
    );
  };

  function buildMatchCardHtml(fixture) {
    {
      const matchPreds = groupedByMatch.get(String(fixture.matchId)) || [];
      const homeWins = matchPreds.filter((p) => p.pred1 > p.pred2).length;
      const draws = matchPreds.filter((p) => p.pred1 === p.pred2).length;
      const awayWins = matchPreds.filter((p) => p.pred2 > p.pred1).length;
      const homePct = matchPreds.length
        ? Math.round((homeWins / matchPreds.length) * 100)
        : 0;
      const drawPct = matchPreds.length
        ? Math.round((draws / matchPreds.length) * 100)
        : 0;
      const awayPct = Math.max(0, 100 - homePct - drawPct);
      const scoreGroups = buildScoreGroups(matchPreds);

      // ─── NEW: LOOK UP COLORS HERE ───
      const homeColor = wcTeamColors[fixture.team1] || "var(--wc-blue)";
      const awayColor = wcTeamColors[fixture.team2] || "var(--wc-red)";

      const result = STATE.results?.[fixture.matchId];
      const isFinished =
        result &&
        ["FT", "AET", "PEN", "FINISHED", "FULL_TIME"].includes(
          String(result.status || "").toUpperCase(),
        );
      const finalScore =
        isFinished && result.score1 != null && result.score2 != null
          ? `${result.score1}-${result.score2}`
          : null;

      const popularHtml = scoreGroups.length
        ? scoreGroups
            .map((group, index) => {
              const hasStarted =
                result &&
                !["NS", "NOT_STARTED", "TBD"].includes(
                  String(result.status || "").toUpperCase(),
                );

              // Only highlight the exact score (15 pts)
              const scoreClass =
                isFinished && finalScore && group.score === finalScore
                  ? "correct-score"
                  : "";

              return `
          <div class="popular-score ${index === 0 ? "popular-score-top" : ""} ${scoreClass}">
            <div class="popular-score-main">
              <span class="score-badge">${escapeHtml(group.score)}</span>
              <strong>${group.count} pick${group.count === 1 ? "" : "s"}</strong>
            </div>

            ${
              hasStarted
                ? `
              <div class="popular-score-names">
                ${group.users
                  .map((name) => `<span>${escapeHtml(name)}</span>`)
                  .join("")}
              </div>
            `
                : ""
            }
          </div>
        `;
            })
            .join("")
        : `<div class="empty-state compact"><p>No predictions yet for this match.</p></div>`;

      return `
            <article class="home-match-card-large${isFinished ? " match-finished" : ""}">
              <div class="home-match-card-head">
                <div>
                  <div class="home-match-kickoff">
  ${escapeHtml(formatKickoff(fixture))}
  <span class="match-status-badge ${getMatchStatusInfo(fixture).cssClass}">${escapeHtml(getMatchStatusInfo(fixture).label)}</span>
  ${fixture.group ? `<span class="match-group-label">${escapeHtml(fixture.group)}</span>` : ""}
</div>
                  <h4>${escapeHtml(fixture.team1 || "TBD")} ${finalScore ? `<span class="final-score-chip">${escapeHtml(finalScore)}</span>` : "<span>vs</span>"} ${escapeHtml(fixture.team2 || "TBD")}</h4>
                </div>
                <div class="pick-count"><strong>${matchPreds.length}</strong><span>picks</span></div>
              </div>

              <div class="match-percent-bar" aria-label="Prediction percentage split">
                <span class="match-bar-home" style="width:${homePct}%; background-color:${homeColor};"></span>
                <span class="match-bar-draw" style="width:${drawPct}%"></span>
                <span class="match-bar-away" style="width:${awayPct}%; background-color:${awayColor};"></span>
              </div>

              <div class="match-percent-labels">
                <span><strong>${homePct}%</strong>${escapeHtml(fixture.team1 || "Home")}</span>
                <span><strong>${drawPct}%</strong>Draw</span>
                <span><strong>${awayPct}%</strong>${escapeHtml(fixture.team2 || "Away")}</span>
              </div>

              <div class="popular-score-section">
                <div class="popular-score-title">Most popular predictions</div>
                ${popularHtml}
              </div>
           </article>
        `;
    }
  }

  function buildDaySection(label, list) {
    if (!list.length) return "";
    return `<div class="home-day-section"><h3 class="home-day-heading">${escapeHtml(label)}</h3><div class="home-day-cards">${list.map(buildMatchCardHtml).join("")}</div></div>`;
  }

  const hasAnyFixtures =
    windowBuckets.yesterday.length ||
    windowBuckets.today.length ||
    windowBuckets.tomorrow.length;
  matchCards.innerHTML = hasAnyFixtures
    ? [
        buildDaySection("Yesterday", windowBuckets.yesterday),
        buildDaySection("Today", windowBuckets.today),
        buildDaySection("Tomorrow", windowBuckets.tomorrow),
      ].join("")
    : `<div class="empty-state compact"><p>No fixtures are scheduled for today yet.</p></div>`;
  // Kept the top summary bar as default colors since it aggregates all matches
  winBar.innerHTML = `
    <div class="win-meter-track" aria-hidden="true">
      <span class="win-home" style="width:${winSplit.home || 0}%"></span>
      <span class="win-draw" style="width:${winSplit.draw || 0}%"></span>
      <span class="win-away" style="width:${winSplit.away || 0}%"></span>
    </div>
    <div class="win-meter-legend">
      <span><strong>${winSplit.home}</strong> home</span>
      <span><strong>${winSplit.draw}</strong> draw</span>
      <span><strong>${winSplit.away}</strong> away</span>
    </div>
  `;
}
function ensureAdminNav() {
  const nav = document.getElementById("main-nav");
  if (!nav) return;

  const settingsBtn = document.getElementById("settings-nav-btn");
  if (settingsBtn) {
    settingsBtn.style.display = SESSION.isAdmin ? "inline-block" : "none";
  }

  const existing = document.getElementById("admin-nav-btn");
  if (SESSION.isAdmin) {
    if (existing) return;

    const btn = document.createElement("button");
    btn.className = "nav-btn";
    btn.id = "admin-nav-btn";
    btn.type = "button";
    btn.innerHTML =
      'Admin <span class="nav-badge" id="admin-request-badge" hidden>0</span>';
    btn.addEventListener("click", () => showView("admin", btn));
    nav.appendChild(btn);
    return;
  }

  if (existing) existing.remove();
}

async function requestSync() {
  const dot = document.getElementById("sync-dot");
  const timeEl = document.getElementById("last-sync-time");
  const syncBtn = document.querySelector(".sync-btn");

  if (dot) dot.className = "status-dot loading";
  if (timeEl) timeEl.textContent = "Syncing...";
  if (syncBtn) syncBtn.classList.add("loading");

  let hadError = false;
  const runStep = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      hadError = true;
      console.warn(`${label} failed.`, error);
    }
  };

  await runStep("Game data sync", () => loadGameData());
  if (!STATE.fixtures.length) {
    await runStep("Fixture fallback", () => loadFixtures());
  }
  await runStep("Results sync", () => loadResults());
  await runStep("Leaderboard sync", () => loadLeaderboard());
  await runStep("Group standings sync", () => loadGroupStandings());
  await runStep("All predictions sync", () => loadAllPredictions());
  await runStep("Prediction sync", () => loadPredictions());
  await runStep("Account request sync", () => loadAccountRequests());

  const safeRender = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      hadError = true;
      console.warn(`${label} render failed.`, error);
    }
  };

  await safeRender("Home", () => renderHome());
  await safeRender("Predictions", () => renderPredictions());
  await safeRender("Group standings", () => renderGroupStandings());
  await safeRender("Leaderboard", () => renderLeaderboard());
  await safeRender("Results", () => renderResults());
  await safeRender("Bracket", () => renderBracket());
  await safeRender("Admin", () => renderAdmin());

  const hasAnyData =
    STATE.fixtures.length ||
    Object.keys(STATE.results).length ||
    STATE.leaderboard.length ||
    Object.keys(STATE.groupStandings).length ||
    Object.keys(STATE.predictions).length ||
    STATE.accountRequests.length;

  STATE.lastSync = new Date();
  if (dot)
    dot.className =
      hadError && !hasAnyData ? "status-dot" : "status-dot active";
  if (timeEl) {
    timeEl.textContent =
      hadError && !hasAnyData
        ? "Sync failed"
        : `Live - ${STATE.lastSync.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Africa/Cairo",
          })}`;
  }

  updateAdminBadge();
  if (syncBtn) syncBtn.classList.remove("loading");
}
async function loadAccountRequests() {
  STATE.accountRequests = [];

  // 1. Try Supabase
  try {
    const data = await supabaseSelect(
      "accountRequests",
      "*",
      "order=createdAt.desc",
    );
    if (data && data.length) {
      STATE.accountRequests = data;
      return;
    }
  } catch (error) {
    console.warn("Could not load Supabase account requests.", error.message);
  }

  // 2. Try Firestore
  if (!db) return;

  try {
    const snap = await db
      .collection("accountRequests")
      .orderBy("createdAt", "desc")
      .get();
    STATE.accountRequests = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.warn("Could not load Firestore account requests.", error.message);
  }
}

function sortFixtures(fixtures) {
  return fixtures.sort((a, b) => {
    const aTime = a.kickoffDate ? a.kickoffDate.getTime() : 0;
    const bTime = b.kickoffDate ? b.kickoffDate.getTime() : 0;
    return aTime - bTime || Number(a.matchId) - Number(b.matchId);
  });
}

async function loadFixtures() {
  let fixtures = [];

  const apiFixtures = await loadFixturesFromApi();
  if (apiFixtures.length) {
    STATE.fixtures = sortFixtures(apiFixtures);
    return;
  }

  // 1. Try Supabase
  try {
    const data = await supabaseSelect("fixtures");
    if (data && data.length) {
      STATE.fixtures = sortFixtures(data.map(normalizeFixture));
      return;
    }
  } catch (error) {
    console.warn("Could not load Supabase fixtures.", error.message);
  }

  // 2. Try Firestore
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

  STATE.fixtures = sortFixtures(fixtures);
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
  const syncedResults = resultsWithScores(STATE.results);
  STATE.results = {};

  const apiResults = Object.keys(syncedResults).length
    ? syncedResults
    : await loadResultsFromApi();
  if (Object.keys(apiResults).length) {
    STATE.results = apiResults;
    return;
  }

  let supabaseResults = [];
  let firestoreResults = [];

  // 1. Try Supabase
  try {
    const data = await supabaseSelect("results");
    if (data && data.length) {
      supabaseResults = data;
    }
  } catch (error) {
    console.warn("Could not load Supabase results.", error.message);
  }

  // 2. Try Firestore
  if (db) {
    try {
      const snap = await db.collection("results").get();
      firestoreResults = snap.docs.map((doc) => {
        const result = doc.data();
        const matchId = String(result.matchId || doc.id.replace(/^match_/, ""));
        return {
          id: doc.id,
          ...result,
          matchId,
        };
      });
    } catch (error) {
      console.warn("Could not load Firestore results.", error.message);
    }
  }

  const merged = {};
  supabaseResults.forEach((r) => {
    const matchId = String(r.matchId || r.id || "").replace(/^match_/, "");
    const norm = normalizeResult({ ...r, matchId });
    if (norm.matchId) merged[norm.matchId] = norm;
  });

  firestoreResults.forEach((r) => {
    const norm = normalizeResult(r);
    if (!norm.matchId) return;
    if (!merged[norm.matchId]) {
      // Only use Firebase if Supabase has no entry for this matchId
      merged[norm.matchId] = norm;
    }
  });
  const localResults = readLocalObject(
    `ggo_wc_results_${SESSION.username || "demo"}`,
  );
  STATE.results = resultsWithScores({ ...localResults, ...merged });

  // Inject mock results for local development/testing if no database or API is connected
  if (!db && !CONFIG.appsScriptUrl && Object.keys(STATE.results).length === 0) {
    STATE.results = {
      1: { matchId: "1", score1: 2, score2: 1, status: "FT" },
      2: { matchId: "2", score1: 1, score2: 1, status: "1H" },
      3: { matchId: "3", score1: 0, score2: 2, status: "FT" },
    };
  }
}

async function loadAllPredictions() {
  try {
    const localAll = readLocalObject("ggo_wc_predictions_all") || {};
    const PAGE = 1000;
    let supabaseAll = [];
    let offset = 0;
    while (true) {
      const response = await fetch(
        getSupabaseUrl("predictions", `select=*&order=submittedAt.asc`),
        {
          headers: supabaseHeaders({
            "Range-Unit": "items",
            Range: `${offset}-${offset + PAGE - 1}`,
          }),
        },
      );
      const page = await response.json();
      if (!Array.isArray(page) || page.length === 0) break;
      supabaseAll = supabaseAll.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    const merged = { ...localAll };

    supabaseAll.forEach((prediction) => {
      const matchId = String(prediction.match_id ?? prediction.matchId);
      const id = String(prediction.id || "");
      const key =
        id || String(prediction.username || "unknown") + "_" + matchId;
      const normalized = normalizePrediction({
        ...prediction,
        id: key,
        matchId,
      });
      merged[key] = normalized;
    });

    STATE.allPredictions = merged;
    writeLocalObject("ggo_wc_predictions_all", STATE.allPredictions);
  } catch (error) {
    console.warn("Could not load all predictions.", error.message);
    STATE.allPredictions = readLocalObject("ggo_wc_predictions_all") || {};
  }
}

async function loadPredictions() {
  const local =
    readLocalObject(`ggo_wc_predictions_${SESSION.username || "demo"}`) || {};

  if (!SESSION.username) {
    STATE.predictions = local;
    return;
  }

  let supabasePredictions = [];

  // 1. Try Supabase
  try {
    const data = await supabaseSelect(
      "predictions",
      "*",
      `username=eq.${encodeURIComponent(SESSION.username)}`,
    );
    if (data && data.length) {
      supabasePredictions = data;
    }
  } catch (error) {
    console.warn("Could not load Supabase predictions.", error.message);
  }

  // Merge local and Supabase (Supabase takes precedence)
  const merged = { ...local };

  supabasePredictions.forEach((prediction) => {
    const matchId = String(prediction.match_id ?? prediction.matchId);
    const existing = merged[matchId];
    if (existing) {
      const existingTime = new Date(existing.submittedAt || 0).getTime();
      const newTime = new Date(prediction.submittedAt || 0).getTime();
      if (newTime >= existingTime) {
        merged[matchId] = normalizePrediction(prediction);
      }
    } else {
      merged[matchId] = normalizePrediction(prediction);
    }
  });

  STATE.predictions = merged;

  // Write merged predictions back to local storage
  writeLocalObject(`ggo_wc_predictions_${SESSION.username}`, STATE.predictions);
}

async function loadLeaderboard() {
  STATE.leaderboard = [];

  let supabaseLeaderboard = [];
  let firestoreLeaderboard = [];

  const sortFn = (a, b) => {
    const rankA = a.rank ?? 9999;
    const rankB = b.rank ?? 9999;
    if (rankA !== rankB) return rankA - rankB;

    const pointsA = a.totalPoints ?? 0;
    const pointsB = b.totalPoints ?? 0;
    if (pointsA !== pointsB) return pointsB - pointsA;

    const exactA = a.exactScores ?? 0;
    const exactB = b.exactScores ?? 0;
    if (exactA !== exactB) return exactB - exactA;

    const outcomesA = a.correctOutcomes ?? 0;
    const outcomesB = b.correctOutcomes ?? 0;
    if (outcomesA !== outcomesB) return outcomesB - outcomesA;

    const userA = String(a.username || "").toLowerCase();
    const userB = String(b.username || "").toLowerCase();
    return userA.localeCompare(userB);
  };

  // 1. Try Supabase first so the main leaderboard matches the profile view.
  try {
    const data = await supabaseSelect("leaderboard", "*", "order=rank.asc");
    if (data && data.length) {
      supabaseLeaderboard = data;
    }
  } catch (error) {
    console.warn("Could not load Supabase leaderboard.", error.message);
  }

  // 2. Try the API / leaderboard endpoint as a fallback.
  if (!supabaseLeaderboard.length) {
    const apiLeaderboard = await loadLeaderboardFromApi();
    if (apiLeaderboard.length) {
      STATE.leaderboard = apiLeaderboard.sort(sortFn);
      return;
    }
  }

  // 3. Try Firestore
  if (db) {
    try {
      const current = await db.collection("leaderboard").doc("current").get();
      if (current.exists && Array.isArray(current.data().players)) {
        firestoreLeaderboard = current.data().players;
      }
    } catch (error) {
      console.warn("Could not load Firestore leaderboard.", error.message);
    }
  }

  if (supabaseLeaderboard.length) {
    STATE.leaderboard = supabaseLeaderboard.sort(sortFn);
  } else if (firestoreLeaderboard.length) {
    STATE.leaderboard = firestoreLeaderboard.sort(sortFn);
  } else {
    STATE.leaderboard = buildLocalLeaderboard();
  }
}

function normalizeFixture(fixture) {
  const matchId = String(fixture.matchId || fixture.num || fixture.id || "");
  const kickoffDate = parseKickoff(
    fixture.date,
    fixture.time,
    fixture.kickoffUTC,
  );
  const stage = fixture.stage || getStageFromRound(fixture.round);

  const seedOverride = R32_SEED_MAP[matchId];

  return {
    ...fixture,
    matchId,
    group: fixture.group || stageLabel(stage),
    stage,
    kickoffUTC: kickoffDate
      ? kickoffDate.toISOString()
      : fixture.kickoffUTC || "",
    kickoffDate,
    team1: seedOverride
      ? seedOverride.team1
      : fixture.team1 || fixture.homeTeam || "TBD",
    team2: seedOverride
      ? seedOverride.team2
      : fixture.team2 || fixture.awayTeam || "TBD",
    ground: fixture.ground || fixture.venue || "TBD",
  };
}

function normalizePrediction(prediction) {
  return {
    ...prediction,
    matchId: String(prediction.match_id ?? prediction.matchId),
    pred1: Number(prediction.pred1),
    pred2: Number(prediction.pred2),
  };
}

function normalizeResult(result) {
  const status = normalizeResultStatus(result.status);
  const score1 = readResultScore(result, "home");
  const score2 = readResultScore(result, "away");
  return {
    ...result,
    matchId: String(result.matchId),
    score1: nullableNumber(score1),
    score2: nullableNumber(score2),
    status,
  };
}

function readResultScore(result, side) {
  const directKeys =
    side === "home"
      ? [
          "score1",
          "team1Score",
          "homeScore",
          "home_score",
          "homeGoals",
          "goalsHome",
        ]
      : [
          "score2",
          "team2Score",
          "awayScore",
          "away_score",
          "awayGoals",
          "goalsAway",
        ];

  for (const key of directKeys) {
    if (
      result[key] !== undefined &&
      result[key] !== null &&
      result[key] !== ""
    ) {
      return result[key];
    }
  }

  const nested = result.score || result.result || result.scores;
  if (nested && typeof nested === "object") {
    const paths =
      side === "home"
        ? [
            ["home"],
            ["local"],
            ["team1"],
            ["fulltime", "home"],
            ["ft", "home"],
            ["final", "home"],
          ]
        : [
            ["away"],
            ["visitor"],
            ["team2"],
            ["fulltime", "away"],
            ["ft", "away"],
            ["final", "away"],
          ];

    for (const path of paths) {
      let value = nested;
      let found = true;
      for (const key of path) {
        if (value && typeof value === "object" && key in value) {
          value = value[key];
        } else {
          found = false;
          break;
        }
      }
      if (found && value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return null;
}

function normalizeResultStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (!value) return "NS";
  if (
    [
      "ft",
      "fulltime",
      "full-time",
      "finished",
      "completed",
      "complete",
    ].includes(value)
  ) {
    return "FT";
  }
  if (["ht", "half-time", "halftime"].includes(value)) {
    return "HT";
  }
  if (
    [
      "live",
      "in_play",
      "inplay",
      "1h",
      "first half",
      "2h",
      "second half",
    ].includes(value)
  ) {
    return value === "2h" || value === "second half" ? "2H" : "1H";
  }
  if (["aet", "extra time", "extra-time"].includes(value)) {
    return "AET";
  }
  if (["pen", "penalties", "pens"].includes(value)) {
    return "PEN";
  }
  return status ? String(status).toUpperCase() : "NS";
}

async function savePrediction(matchId, pred1, pred2, penWinner = null) {
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

  const matchIdStr = String(matchId);
  if (savingMatchId === matchIdStr) return;

  savingMatchId = matchIdStr;
  renderPredictions();

  try {
    // 1. Save to Supabase FIRST
    const docId = `${SESSION.username}_${matchIdStr}`;
    const row = {
      id: docId,
      username: SESSION.username,
      matchId: matchIdStr,
      pred1: score1,
      pred2: score2,
      pen_winner: penWinner,
      submittedAt: new Date().toISOString(),
      pointsAwarded: null,
      scoredAt: null,
    };
    await supabaseUpsert("predictions", [row], "id");

    // 2. Update local state
    const prediction = {
      matchId: matchIdStr,
      username: SESSION.username,
      pred1: score1,
      pred2: score2,
      pen_winner: penWinner,
      submittedAt: new Date().toISOString(),
      pointsAwarded: null,
      scoredAt: null,
    };
    STATE.predictions[matchIdStr] = prediction;
    writeLocalObject(
      `ggo_wc_predictions_${SESSION.username}`,
      STATE.predictions,
    );

    showToast(`Saved: ${fixture.team1} ${score1}–${score2} ${fixture.team2}`);
  } catch (error) {
    console.error("Save failed:", error);
    showToast("Save failed – please try again.", "error");
  } finally {
    savingMatchId = null;
    await loadPredictions();
    renderPredictions();
    renderGroupStandings();
    renderLeaderboard();
  }
}

function renderPredictions() {
  const container = document.getElementById("predictions-list");
  if (!container) return;

  const visibleFixtures = STATE.fixtures.filter((fixture) => {
    if (activeMatchFilter === "open") return !isLocked(fixture);
    if (activeMatchFilter === "locked") return isLocked(fixture);
    if (activeMatchFilter === "live") {
      const result = STATE.results[fixture.matchId];
      return result && isLiveStatus(result.status);
    }
    return true;
  });

  if (!visibleFixtures.length) {
    const hasFixtures = STATE.fixtures.length > 0;
    if (!hasFixtures) {
      container.innerHTML = emptyState(
        "Fixtures are not loaded yet.",
        "Run the app from a local server or seed Firestore fixtures.",
      );
    } else if (activeMatchFilter === "live") {
      container.innerHTML = emptyState(
        "No live matches right now.",
        "Check back when a game is in progress.",
      );
    } else if (activeMatchFilter === "open") {
      container.innerHTML = emptyState(
        "No open matches.",
        "All upcoming fixtures are locked or finished.",
      );
    } else if (activeMatchFilter === "locked") {
      container.innerHTML = emptyState(
        "No locked matches.",
        "Open fixtures are still accepting predictions.",
      );
    } else {
      container.innerHTML = emptyState("No matches to show.", "");
    }
    return;
  }
  // REPLACE lines 1814-1831 (the groups = groupBy ... container.innerHTML block) with:
  const STAGE_ORDER = [
    "group",
    "group_stage",
    "r32",
    "r16",
    "qf",
    "sf",
    "third",
    "final",
  ];
  const stageOf = (f) => f.stage || getStageFromRound(f.round || "") || "group";

  // Sort fixtures: by stage order then by kickoff
  visibleFixtures.sort((a, b) => {
    const si = STAGE_ORDER.indexOf(stageOf(a));
    const sj = STAGE_ORDER.indexOf(stageOf(b));
    if (si !== sj) return si - sj;
    return (
      (a.kickoffDate?.getTime?.() || 0) - (b.kickoffDate?.getTime?.() || 0)
    );
  });

  // Group by date within each stage
  let lastStage = null;
  const sections = [];
  const dateGroups = groupBy(visibleFixtures, (fixture) => {
    const fixtureLocalDate = formatFixtureLocalDate(fixture);
    return (
      (fixtureLocalDate || fixture.date || "Unknown Date") +
      "||" +
      stageOf(fixture)
    );
  });

  Object.entries(dateGroups).forEach(([key, fixtures]) => {
    const [groupName, stage] = key.split("||");
    if (stage !== lastStage) {
      sections.push(
        `<div class="pred-stage-divider"><span>${escapeHtml(stageLabel(stage))}</span></div>`,
      );
      lastStage = stage;
    }
    sections.push(`
      <section class="group-section">
        <h3>${escapeHtml(groupName)}</h3>
        <div class="group-matches">
          ${fixtures.map(renderPredictionCard).join("")}
        </div>
      </section>
    `);
  });

  container.innerHTML = sections.join("");
}

function renderPredictionCard(match) {
  // Resolve slot codes (W74, W77 etc) to real team names if results exist
  const team1 = isBracketReference(match.team1)
    ? resolveSlot(match.team1) || match.team1
    : match.team1;
  const team2 = isBracketReference(match.team2)
    ? resolveSlot(match.team2) || match.team2
    : match.team2;
  match = { ...match, team1, team2 };

  const pred = STATE.predictions[match.matchId] || {};
  const result = STATE.results[match.matchId];
  const locked = isLocked(match);
  const status = getMatchStatus(match, result);
  const venue = getVenueDetails(match);
  const hasPred = hasPrediction(pred);
  const hasRes = result && hasResult(result);
  const isSaving = savingMatchId === match.matchId; // ★ already present

  const points =
    hasRes && hasPred
      ? calculateMatchPoints(
          pred.pred1,
          pred.pred2,
          result.score1,
          result.score2,
          match.stage,
          pred.pen_winner,
          result.penalty_winner,
        )
      : null;
  const ptsTier = (() => {
    if (points === null) return "";
    if (points === 0) return "pts-zero";
    const multiplierMap = {
      group: 1,
      r32: 2,
      r16: 2.5,
      qf: 3,
      sf: 4,
      third: 4,
      final: 5,
    };
    const mult =
      multiplierMap[String(match.stage || "group").toLowerCase()] ?? 1;
    const base = points / mult;
    if (Math.abs(base - 15) < 0.01) return "pts-exact";
    if (Math.abs(base - 8) < 0.01 || Math.abs(base - 5) < 0.01)
      return base >= 8 ? "pts-good" : "pts-partial";
    return "pts-partial";
  })();

  const isLive = result && isLiveStatus(result.status);
  const isFinal = result && isFinalStatus(result.status);

  const statusLineHtml =
    locked && !hasRes
      ? '<div class="mc-status-line"><span class="status-token">LOCK</span><span>Predictions closed</span></div>'
      : hasPred && !locked && !hasRes
        ? '<div class="mc-status-line"><span class="status-token">SAVED</span><span>Prediction saved</span></div>'
        : !locked && !hasRes
          ? '<div class="mc-status-line"><span class="status-token open-token">OPEN</span><span>Enter prediction</span></div>'
          : "";

  const predictionScore = hasPred ? `${pred.pred1}-${pred.pred2}` : "—";
  const actualScore = hasRes
    ? `${result.score1 ?? "-"}-${result.score2 ?? "-"}`
    : "vs";

  const resultScoreHtml = hasRes
    ? `
      <div class="mc-scoreline">
        <div class="mc-scoreline-row">
          <span class="mc-scoreline-label">Result</span>
          <span class="mc-scoreline-actual">${actualScore}</span>
        </div>
        <div class="mc-scoreline-divider"></div>
        <div class="mc-scoreline-row ${hasPred ? "has-pick" : "no-pick"}">
          <span class="mc-scoreline-label">Your Pick</span>
          <span class="mc-scoreline-pick">${predictionScore}</span>
        </div>
        ${
          hasPred
            ? `
          <div class="mc-scoreline-divider"></div>
          <div class="mc-scoreline-points">
            <span class="mc-scoreline-pts ${ptsTier}">${points ?? 0} pts</span>
          </div>
        `
            : ""
        }
      </div>`
    : `<div class="mc-vs">VS</div>`;

  return `
    <article class="match-card ${locked ? "locked" : "open"} ${isLive ? "live" : ""} ${isFinal ? "final" : ""}">
      <div class="mc-header">
<div class="mc-meta">
          <span class="mc-kickoff"><span class="meta-label">Kickoff</span>${formatKickoff(match)}</span>
          ${match.stage && match.stage !== "group" && match.stage !== "group_stage" ? `<span class="mc-stage-badge">${escapeHtml(stageLabel(match.stage))}</span>` : ""}
          <a class="mc-venue" href="${venue.mapsUrl}" target="_blank" rel="noopener noreferrer">
            <span class="meta-label">City</span>
            <strong>${escapeHtml(venue.city)}</strong>
            <span>${escapeHtml(venue.stadium)}</span>
          </a>
        </div>
      </div>

      <div class="mc-body">
        <div class="mc-team">
          <div class="team-mark">${getFlagImg(match.team1)}</div>
          <div class="mc-name">${escapeHtml(match.team1)}</div>
      ${
        hasRes
          ? ``
          : `<input class="score-input ${locked ? "" : "editable"}" type="number" min="0" max="20"
            inputmode="numeric" placeholder="-"
            value="${Number.isInteger(pred.pred1) ? pred.pred1 : ""}"
            ${locked || isSaving ? "disabled" : ""}
            data-matchid="${match.matchId}" data-team="1"
            oninput="handleScoreChange('${match.matchId}')">`
      }
        </div>

        <div class="mc-middle">
          ${resultScoreHtml}
        </div>

        <div class="mc-team">
          <div class="team-mark">${getFlagImg(match.team2)}</div>
          <div class="mc-name">${escapeHtml(match.team2)}</div>
        ${
          hasRes
            ? ``
            : `<input class="score-input ${locked ? "" : "editable"}" type="number" min="0" max="20"
            inputmode="numeric" placeholder="-"
            value="${Number.isInteger(pred.pred2) ? pred.pred2 : ""}"
            ${locked || isSaving ? "disabled" : ""}
            data-matchid="${match.matchId}" data-team="2"
            oninput="handleScoreChange('${match.matchId}')">`
        }
        </div>
      </div>

      ${statusLineHtml ? `<div class="mc-footer">${statusLineHtml}</div>` : ""}

      <!-- ★ Add loading overlay -->
      ${
        isSaving
          ? `
        <div class="mc-loading-overlay">
          <span class="spinner"></span>
          <span>Saving…</span>
        </div>
      `
          : ""
      }
    </article>
  `;
}

let saveTimeout = null;
const saveTimeouts = new Map(); // ← Add this

function handleScoreChange(matchId) {
  // Clear existing timeout for this match
  if (saveTimeouts.has(matchId)) {
    clearTimeout(saveTimeouts.get(matchId));
  }

  const timeout = setTimeout(() => {
    const input1 = document.querySelector(
      `.score-input[data-matchid="${cssEscape(matchId)}"][data-team="1"]`,
    );
    const input2 = document.querySelector(
      `.score-input[data-matchid="${cssEscape(matchId)}"][data-team="2"]`,
    );
    if (!input1 || !input2) return;
    const v1 = input1.value.trim();
    const v2 = input2.value.trim();
    if (v1 === "" || v2 === "") return;
    const num1 = Number(v1);
    const num2 = Number(v2);
    if (
      !Number.isInteger(num1) ||
      !Number.isInteger(num2) ||
      num1 < 0 ||
      num2 < 0
    )
      return;

    if (num1 === num2 && isKnockoutMatch(matchId)) {
      showPenaltyPopup(matchId, num1, num2);
    } else {
      savePrediction(matchId, num1, num2);
    }
    saveTimeouts.delete(matchId);
  }, 400);

  saveTimeouts.set(matchId, timeout);
}
function isKnockoutMatch(matchId) {
  const fixture = STATE.fixtures.find((m) => m.matchId === String(matchId));
  if (!fixture) return false;
  const stage = String(
    fixture.stage || getStageFromRound(fixture.round || "") || "",
  ).toLowerCase();
  return stage !== "group" && stage !== "group_stage" && stage !== "";
}

function showPenaltyPopup(matchId, num1, num2) {
  const fixture = STATE.fixtures.find((m) => m.matchId === String(matchId));
  if (!fixture) return;

  const existing = document.getElementById("pen-popup-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "pen-popup-overlay";
  overlay.className = "pen-popup-overlay";
  overlay.innerHTML = `
    <div class="pen-popup">
      <div class="pen-popup-title">Draw — who wins on penalties?</div>
      <div class="pen-popup-teams">
        <button class="pen-popup-btn" data-team="1">${escapeHtml(fixture.team1)}</button>
        <button class="pen-popup-btn" data-team="2">${escapeHtml(fixture.team2)}</button>
      </div>
      <button class="pen-popup-cancel">Cancel</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelectorAll(".pen-popup-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const penWinner = btn.dataset.team === "1" ? "team1" : "team2";
      overlay.remove();
      savePrediction(matchId, num1, num2, penWinner);
    });
  });
  overlay.querySelector(".pen-popup-cancel").addEventListener("click", () => {
    overlay.remove();
    renderPredictions();
  });
}
function renderGroupStandings() {
  const container = document.getElementById("group-standings");
  if (!container) return;

  const groups = STATE.groupStandings || {};

  if (!Object.keys(groups).length) {
    container.innerHTML = emptyState(
      "Official group tables are not synced yet.",
      "",
    );
    renderThirdPlaceTable();
    return;
  }

  container.innerHTML = Object.entries(groups)
    .map(([groupName, standings]) => renderGroupTable(groupName, standings))
    .join("");

  renderThirdPlaceTable();
}
function renderGroupTable(groupName, standings) {
  if (!standings || !standings.length) return "";

  // Sort by position (already sorted from DB, but just in case)
  const sorted = standings.sort((a, b) => a.position - b.position);

  return `
    <div class="group-table">
      <h3>${escapeHtml(groupName)}</h3>
      <table class="group-standings-table">
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
          ${sorted
            .map(
              (row) => `
            <tr>
              <td class="team-rank">${row.position}</td>
              <td data-label="Team">${getFlagImg(row.team_name)} ${escapeHtml(row.team_name)}</td>
              <td>${row.played ?? 0}</td>
              <td>${row.won ?? 0}</td>
              <td>${row.drawn ?? 0}</td>
              <td>${row.lost ?? 0}</td>
              <td>${(row.goal_difference ?? 0) > 0 ? "+" : ""}${row.goal_difference ?? 0}</td>
              <td><strong>${row.points ?? 0}</strong></td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
function getThirdPlaceStandings() {
  const groups = STATE.groupStandings || {};
  return Object.entries(groups)
    .map(([groupName, standings]) => {
      const thirdPlace = Array.isArray(standings)
        ? standings.find((row) => Number(row.position) === 3)
        : null;
      if (!thirdPlace) return null;
      return {
        groupName,
        ...thirdPlace,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goal_difference - a.goal_difference ||
        b.goals_for - a.goals_for ||
        String(a.team_name).localeCompare(String(b.team_name)),
    )
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      qualifies: index < 8,
    }));
}

function renderThirdPlaceTable() {
  const container = document.getElementById("third-place-standings");
  if (!container) return;

  const rows = getThirdPlaceStandings();

  if (!rows.length) {
    container.innerHTML = emptyState(
      "Third-place qualifiers will appear here once all group tables are loaded.",
      "",
    );
    return;
  }

  const cutoffIndex = Math.min(8, rows.length) - 1;

  container.innerHTML = `
    <article class="third-place-table group-table">
      <table class="group-standings-table third-place-standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>Grp</th>
            <th>P</th>
            <th>GD</th>
            <th>GF</th>
            <th>Pts</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row, index) => `
              <tr class="${row.qualifies ? "" : "eliminated"} ${index === cutoffIndex ? "cutoff-row" : ""}">
                <td data-label="#">${row.rank}</td>
                <td data-label="Team">${getFlagImg(row.team_name)}${escapeHtml(row.team_name)}</td>
                <td data-label="Grp">${escapeHtml(String(row.groupName || "").replace(/^Group\s+/i, ""))}</td>
                <td data-label="P">${row.played}</td>
                <td data-label="GD">${row.goal_difference > 0 ? "+" : ""}${row.goal_difference}</td>
                <td data-label="GF">${row.goals_for}</td>
                <td data-label="Pts"><strong>${row.points}</strong></td>
                <td data-label="Status">${row.qualifies ? "Qualifies" : "Out"}</td>
              </tr>
            `,
            )
            .join("")}
        </tbody>
      </table>
      <div class="third-place-legend">
        <span class="legend-dot qualify" aria-hidden="true"></span>
        <span>Top 8 third-place teams advance to the Round of 32.</span>
      </div>
    </article>
  `;
}
const _lbPrevRanks = {};

function renderLeaderboard() {
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  const rows = STATE.leaderboard.length
    ? STATE.leaderboard
    : buildLocalLeaderboard();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No predictions yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((player, index) => {
      const rank = player.rank || index + 1;
      const name =
        player.displayName || player.playerName || player.username || "Player";
      const username = player.username || "";

      const predicted =
        player.predicted || player.totalPredictions || player.predictions || 0;
      const correctOutcomes =
        player.correctOutcomes || player.outcomeCount || 0;
      const scored =
        player.scored ||
        player.completedPredictions ||
        player.resolvedPredictions ||
        0;

      const percent =
        scored > 0 ? Math.round((correctOutcomes / scored) * 100) : 0;
      const percentDisplay =
        scored > 0
          ? `<span class="${percent >= 50 ? "percent-high" : "percent-low"}">${percent}%</span>`
          : "—";

      // ── Rank change arrow ──
      const prevRank = _lbPrevRanks[username];
      let arrowHtml = `<span class="rank-arrow rank-arrow-neutral">–</span>`;
      if (prevRank !== undefined && prevRank !== rank) {
        const moved = prevRank - rank; // positive = climbed
        arrowHtml =
          moved > 0
            ? `<span class="rank-arrow rank-arrow-up" title="Up ${moved}">▲${moved}</span>`
            : `<span class="rank-arrow rank-arrow-down" title="Down ${Math.abs(moved)}">▼${Math.abs(moved)}</span>`;
      }

      const onclickAttr = username
        ? `onclick="window.location.href='profile.html?user=${encodeURIComponent(username)}'"`
        : "";

      return `
        <tr class="${player.username === SESSION.username ? "current-user" : ""}" 
            style="cursor:pointer" ${onclickAttr}>
          <td data-label="Rank">
            <div class="rank-cell">
              <span class="rank-badge ${rankClass(rank)}">${rank}</span>
              ${arrowHtml}
            </div>
          </td>
          <td data-label="Player">
            <div class="player-info">
              <span class="player-avatar">${getInitials(name)}</span>
              <span class="player-name">${escapeHtml(name)}</span>
            </div>
          </td>
          <td data-label="Points" style="text-align:center"><strong>${player.totalPoints || 0}</strong></td>
          <td data-label="Exact" style="text-align:center">${player.exactScores || player.exactCount || 0}</td>
          <td data-label="Outcome" style="text-align:center">${correctOutcomes}</td>
          <td data-label="Predicted" style="text-align:center">${predicted}</td>
          <td data-label="Correct %" style="text-align:center">${percentDisplay}</td>
        </tr>
      `;
    })
    .join("");

  // Snapshot current ranks for next render
  rows.forEach((player, index) => {
    if (player.username)
      _lbPrevRanks[player.username] = player.rank || index + 1;
  });
}
function openMatchDrawer(matchId) {
  const fixture = STATE.fixtures.find((f) => f.matchId === String(matchId));
  const result = STATE.results[String(matchId)];
  const pred = STATE.predictions[String(matchId)];

  if (!fixture) return;

  const overlay = document.getElementById("match-drawer-overlay");
  const drawer = document.getElementById("match-drawer");
  const inner = document.getElementById("match-drawer-inner");
  if (!overlay || !drawer || !inner) return;

  // ── Scoreline ──
  const team1Flag = getFlagImg(fixture.team1);
  const team2Flag = getFlagImg(fixture.team2);
  const hasRes = result && hasResult(result);
  const isLive = result && isLiveStatus(result.status);
  const isFinal = result && isFinalStatus(result.status);

  const scoreText = hasRes ? `${result.score1} – ${result.score2}` : "– vs –";

  const statusLabel = isLive
    ? result.status
    : isFinal
      ? result.status
      : "Upcoming";

  const statusCls = isLive ? "live" : isFinal ? "ft" : "ns";

  // ── Scorers ──
  const homeScorers = result?.homeScorers || [];
  const awayScorers = result?.awayScorers || [];

  // Parse "Name 45'" into { name, minute } — handle OG, assists etc.
  function parseScorer(s) {
    const m = String(s).match(/^(.+?)\s+(\d+['+\d]*)('?)$/);
    if (m) return { name: m[1].trim(), minute: m[2] + (m[3] || "'") };
    return { name: s, minute: "" };
  }

  // Build merged timeline sorted by minute
  const allEvents = [
    ...homeScorers.map((s) => ({ ...parseScorer(s), side: "home" })),
    ...awayScorers.map((s) => ({ ...parseScorer(s), side: "away" })),
  ].sort((a, b) => parseInt(a.minute) - parseInt(b.minute));

  function scorerTimelineHtml() {
    if (!hasRes) return `<p class="no-scorers">Match not played yet.</p>`;
    if (!allEvents.length)
      return `<p class="no-scorers">No scorer data available.</p>`;

    return allEvents
      .map((ev) => {
        const isHome = ev.side === "home";
        return `
        <div class="scorer-row">
          <div class="scorer-name ${isHome ? "" : "empty"}">${isHome ? escapeHtml(ev.name) : ""}</div>
          <div class="scorer-minute">
            <span class="scorer-ball">⚽</span>
            <span class="scorer-minute-pill">${escapeHtml(ev.minute)}</span>
          </div>
          <div class="scorer-name away-name ${!isHome ? "" : "empty"}">${!isHome ? escapeHtml(ev.name) : ""}</div>
        </div>
      `;
      })
      .join("");
  }

  // ── Prediction block ──
  const hasPred = hasPrediction(pred);
  const points =
    hasRes && hasPred
      ? calculateMatchPoints(
          pred.pred1,
          pred.pred2,
          result.score1,
          result.score2,
          null,
          pred.pen_winner,
          result.penalty_winner,
        )
      : null;

  const ptsCls =
    points === null
      ? ""
      : points >= 15
        ? "pts-exact"
        : points >= 8
          ? "pts-good"
          : points > 0
            ? "pts-partial"
            : "pts-zero";

  const predScoreHtml = hasPred
    ? `<div class="drawer-pred-score">${pred.pred1} – ${pred.pred2}</div>`
    : `<div class="drawer-pred-score no-pred">No prediction</div>`;

  const predPtsHtml =
    points !== null
      ? `<div class="drawer-pred-pts ${ptsCls}">${points}<sub>pts</sub></div>`
      : "";

  // ── Venue ──
  const venue = getVenueDetails(fixture);
  const kickoffStr = formatKickoff(fixture);

  // ── Render ──
  inner.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-header-meta">
        <div class="drawer-round">${escapeHtml(fixture.round || fixture.group || "Match")}</div>
        <div class="drawer-date">${escapeHtml(kickoffStr)}</div>
      </div>
      <button class="drawer-close" onclick="closeMatchDrawer()" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <path d="M3 3l10 10M13 3L3 13"/>
        </svg>
      </button>
    </div>
 
    <div class="drawer-scoreline">
      <div class="drawer-team">
        <div class="drawer-team-badge">${team1Flag}</div>
        <div class="drawer-team-name">${escapeHtml(fixture.team1)}</div>
      </div>
      <div class="drawer-score-block">
        <div class="drawer-score ${isLive ? "live-score" : ""}">${escapeHtml(scoreText)}</div>
        <div class="drawer-status-chip ${statusCls}">
          ${isLive ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--warning);display:inline-block"></span>' : ""}
          ${escapeHtml(statusLabel)}
        </div>
      </div>
      <div class="drawer-team">
        <div class="drawer-team-badge">${team2Flag}</div>
        <div class="drawer-team-name">${escapeHtml(fixture.team2)}</div>
      </div>
    </div>
 
    <div class="drawer-body">
 
      <div class="drawer-section-label">Goalscorers</div>
      <div class="scorer-timeline">
        ${scorerTimelineHtml()}
      </div>
 
      <div class="drawer-section-label">Your Prediction</div>
      <div class="drawer-prediction">
        <div>
          <div class="drawer-pred-label">Predicted score</div>
          ${predScoreHtml}
        </div>
        ${predPtsHtml}
      </div>
 
      <div class="drawer-section-label">Venue</div>
      <div class="drawer-venue">
        <div class="drawer-venue-name">${escapeHtml(venue.stadium)}</div>
        <div class="drawer-venue-city">${escapeHtml(venue.city)}</div>
      </div>
 
    </div>
  `;

  overlay.classList.add("open");
  drawer.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeMatchDrawer() {
  document.getElementById("match-drawer-overlay")?.classList.remove("open");
  document.getElementById("match-drawer")?.classList.remove("open");
  document.body.style.overflow = "";
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
              fixture.stage,
              pred.pen_winner,
              result.penalty_winner,
            )
          : null;

      return `
        <article class="result-card" onclick="openMatchDrawer('${fixture.matchId}')">
          <div class="match-date">${formatKickoff(fixture)}</div>
          <div class="match-teams">
            <div class="team"><div class="team-name">${getFlagImg(fixture.team1)}${escapeHtml(fixture.team1)}</div></div>
            <div class="result-score">${result.score1 ?? "-"} - ${result.score2 ?? "-"}</div>
            <div class="team"><div class="team-name">${getFlagImg(fixture.team2)}${escapeHtml(fixture.team2)}</div></div>
          </div>    
          <div class="result-status">${escapeHtml(normalizeResultStatus(result.status))}</div>
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

  const groups = STATE.groupStandings;
  if (!groups || !Object.keys(groups).length) {
    bracket.innerHTML = emptyState(
      "Group standings not loaded yet.",
      "Please sync again.",
    );
    return;
  }
  const knockout = STATE.fixtures
    .filter((f) => {
      const stage = String(
        f.stage || getStageFromRound(f.round || "") || "",
      ).toLowerCase();
      return stage !== "group" && stage !== "group_stage" && stage !== "";
    })
    .sort((a, b) => Number(a.matchId) - Number(b.matchId));

  if (!knockout.length) {
    bracket.innerHTML = emptyState(
      "Knockout fixtures are not loaded yet.",
      "Sync again to load.",
    );
    return;
  }

  // Build matchMap — deduplicate by matchId (last write wins, prefer latest data)
  const matchMap = {};
  knockout.forEach((m) => {
    const existing = matchMap[String(m.matchId)];
    if (!existing) {
      matchMap[String(m.matchId)] = m;
    }
  });

  // ── Derive bracket structure from actual matchIds, sorted ascending ──
  // Standard WC 2026 match numbering: 65–72=R32 left, 73–80=R32 right, etc.
  // But we derive dynamically: sort knockout by matchId, then assign by count.
  const knockoutIds = Object.keys(matchMap)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  // Partition by expected round size: 32 matches R32, 16 R16, 8 QF, 4 SF, 1 Final, 1 Third
  // WC2026: 32 R32 games (matchIds 65-96), 16 R16 (97-112 not used — actually 16 R32 → 8 R16 → 4 QF → 2 SF → Final + 3rd)
  // Actual count: R32=32, R16=16, QF=8, SF=4, Final=1, Third=1 → total 62...
  // FIFA 2026 actual: R32=32, R16=16, QF=8, SF=4, Final+3rd=2 = 62 matches
  // We auto-detect by total count
  const total = knockoutIds.length;

  let r32Ids = [],
    r16Ids = [],
    qfIds = [],
    sfIds = [],
    finalId = null,
    thirdId = null;

  if (total >= 62) {
    // Full WC2026 bracket
    r32Ids = knockoutIds.slice(0, 32);
    r16Ids = knockoutIds.slice(32, 48);
    qfIds = knockoutIds.slice(48, 56);
    sfIds = knockoutIds.slice(56, 60);
    thirdId = knockoutIds[60] !== undefined ? String(knockoutIds[60]) : null;
    finalId = knockoutIds[61] !== undefined ? String(knockoutIds[61]) : null;
  } else if (total >= 30) {
    r32Ids = knockoutIds.slice(0, total - 18);
    r16Ids = knockoutIds.slice(total - 18, total - 10);
    qfIds = knockoutIds.slice(total - 10, total - 6);
    sfIds = knockoutIds.slice(total - 6, total - 4);
    thirdId =
      knockoutIds[total - 4] !== undefined
        ? String(knockoutIds[total - 4])
        : null;
    finalId =
      knockoutIds[total - 1] !== undefined
        ? String(knockoutIds[total - 1])
        : null;
  } else {
    // Fallback: use original hardcoded IDs
    r32Ids = [
      74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87,
    ].map(String);
    r16Ids = [89, 90, 93, 94, 91, 92, 95, 96].map(String);
    qfIds = [97, 98, 99, 100].map(String);
    sfIds = [101, 102].map(String);
    finalId = "104";
    thirdId = "103";
  }

  // Split left/right halves
  const r32Left = r32Ids.slice(0, r32Ids.length / 2).map(String);
  const r32Right = r32Ids.slice(r32Ids.length / 2).map(String);
  const r16Left = r16Ids.slice(0, r16Ids.length / 2).map(String);
  const r16Right = r16Ids.slice(r16Ids.length / 2).map(String);
  const qfLeft = qfIds.slice(0, qfIds.length / 2).map(String);
  const qfRight = qfIds.slice(qfIds.length / 2).map(String);
  const sfLeft = sfIds.slice(0, 1).map(String);
  const sfRight = sfIds.slice(1).map(String);

  // Grid row assignments (visual spacing)
  const R32_ROWS = [1, 3, 5, 7, 9, 11, 13, 15];
  const R16_ROWS = [2, 6, 10, 14];
  const QF_ROWS = [4, 12];
  const SF_ROWS = [8];

  // ── Explicit bracket layout using confirmed Supabase matchIds ──
  // Left side: odd R32s feed left half; Right side: even R32s feed right half.
  const leftRounds = [
    {
      label: "Round of 32",
      rows: [1, 3, 5, 7, 9, 11, 13, 15],
      ids: ["73", "75", "77", "79", "81", "83", "85", "87"],
    },
    {
      label: "Round of 16",
      rows: [2, 6, 10, 14],
      ids: ["90", "91", "93", "94"],
    },
    {
      label: "Quarter-final",
      rows: [4, 12],
      ids: ["97", "98"],
    },
    {
      label: "Semi-final",
      rows: [8],
      ids: ["101"],
    },
  ];

  const rightRounds = [
    {
      label: "Semi-final",
      rows: [8],
      ids: ["102"],
    },
    {
      label: "Quarter-final",
      rows: [4, 12],
      ids: ["99", "100"],
    },
    {
      label: "Round of 16",
      rows: [2, 6, 10, 14],
      ids: ["89", "92", "95", "96"],
    },
    {
      label: "Round of 32",
      rows: [1, 3, 5, 7, 9, 11, 13, 15],
      ids: ["74", "76", "78", "80", "82", "84", "86", "88"],
    },
  ];

  const finalMatch = matchMap["104"] ?? null;
  const thirdMatch = matchMap["103"] ?? null;

  const renderRound = (round, side) => {
    let html = `
      <div class="bracket-round ${side}" data-round="${escapeHtml(round.label)}">
        <div class="bracket-round-label">${escapeHtml(round.label)}</div>
        <div class="bracket-grid">
    `;

    round.ids.forEach((id, i) => {
      const match = matchMap[id];
      if (!match) return;

      html += `
        <div
          class="bracket-slot"
          style="grid-row:${round.rows[i]}"
          data-row="${round.rows[i]}"
        >
          <div class="bracket-slot-inner">
            ${renderBracketMatch(match)}
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  };

  let html = `
    <div class="bracket-scroll-wrapper">
      <div class="bracket-layout">

        <div class="bracket-side left">
  `;

  leftRounds.forEach((r) => {
    html += renderRound(r, "left");
  });

  html += `
        </div>

        <div class="bracket-center">

          <div class="bracket-final">

            <div class="bracket-round-label">
              Final
            </div>

            ${
              finalMatch
                ? renderBracketMatch(finalMatch)
                : `<div class="bracket-placeholder">TBD</div>`
            }

          </div>

          <div class="bracket-third">

            <div class="bracket-round-label">
              3rd Place
            </div>

            ${
              thirdMatch
                ? renderBracketMatch(thirdMatch)
                : `<div class="bracket-placeholder">TBD</div>`
            }

          </div>

        </div>

        <div class="bracket-side right">
  `;

  rightRounds.forEach((r) => {
    html += renderRound(r, "right");
  });

  html += `
        </div>

      </div>
    </div>
  `;

  bracket.className = "vertical-bracket";
  bracket.innerHTML = html;
  renderBracketTabs();
  syncBracketLayoutMode();

  const wrapper = bracket.querySelector(".bracket-scroll-wrapper");
  const layout = bracket.querySelector(".bracket-layout");
  if (!wrapper || !layout) return;

  const isMobileTabs = window.innerWidth < 1000;

  if (!isMobileTabs) {
    const containerWidth =
      (bracket.parentElement?.clientWidth || window.innerWidth) - 40;
    const DESIGN_WIDTH = 1760;
    const scale = Math.min(1, containerWidth / DESIGN_WIDTH);
    layout.style.transform = `scale(${scale})`;
    layout.style.transformOrigin = "left top";
    wrapper.style.height = `${Math.round(1350 * scale + 120)}px`;
  } else {
    layout.style.transform = "";
    layout.style.transformOrigin = "";
    wrapper.style.height = "";
  }
  wrapper.scrollLeft = 0;
}
function renderBracketTabs() {
  const tabsEl = document.getElementById("bracket-tabs");
  if (!tabsEl) return;

  const rounds = Array.from(
    document.querySelectorAll("#bracket .bracket-round"),
  );

  if (!rounds.length) {
    tabsEl.innerHTML = "";
    return;
  }

  const labels = [];
  const seen = new Set();

  rounds.forEach((round) => {
    const label =
      round.querySelector(".bracket-round-label")?.textContent.trim() || "";

    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  });

  // Also add Final and 3rd Place as tabs (they live in .bracket-center, not .bracket-round)
  ["Final", "3rd Place"].forEach((label) => {
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  });

  tabsEl.innerHTML = labels
    .map(
      (label, i) => `
        <button
          class="bracket-tab ${i === 0 ? "active" : ""}"
          data-round="${escapeHtml(label)}"
        >
          ${escapeHtml(label)}
        </button>
      `,
    )
    .join("");

  const setActiveRound = (roundName) => {
    const isMobile = window.innerWidth < 1000;
    rounds.forEach((round) => {
      const isActive = round.dataset.round === roundName;
      round.dataset.active = isActive ? "true" : "false";
      round.classList.toggle("is-active", isActive);
      if (isMobile) {
        round.style.display = isActive ? "flex" : "none";
      } else {
        round.style.display = "";
      }
    });

    // Handle center column (Final / 3rd Place)
    const bracket = document.getElementById("bracket");
    if (!bracket) return;
    const centerEl = bracket.querySelector(".bracket-center");
    if (!centerEl) return;
    const isCenterTab = roundName === "Final" || roundName === "3rd Place";
    if (isMobile) {
      centerEl.style.display = isCenterTab ? "flex" : "none";
      // Within center, show only the matching block
      centerEl
        .querySelectorAll(".bracket-final, .bracket-third")
        .forEach((block) => {
          const blockLabel = block
            .querySelector(".bracket-round-label")
            ?.textContent.trim();
          block.style.display =
            !roundName || blockLabel === roundName ? "flex" : "none";
        });
    } else {
      centerEl.style.display = "";
      centerEl
        .querySelectorAll(".bracket-final, .bracket-third")
        .forEach((block) => {
          block.style.display = "";
        });
    }
  };

  setActiveRound(labels[0]);
  syncBracketLayoutMode(labels[0]);

  tabsEl.querySelectorAll(".bracket-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const round = btn.dataset.round;

      tabsEl.querySelectorAll(".bracket-tab").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });

      setActiveRound(round);
      syncBracketLayoutMode(round);
    });
  });
}

function syncBracketLayoutMode(activeRound = "") {
  const bracket = document.getElementById("bracket");
  const wrapper = bracket?.querySelector(".bracket-scroll-wrapper");
  const layout = bracket?.querySelector(".bracket-layout");
  if (!bracket || !wrapper || !layout) return;

  const isMobileTabs = window.innerWidth < 1000;
  bracket.classList.toggle("bracket-mobile-tabs", isMobileTabs);

  if (isMobileTabs) {
    wrapper.style.display = "flex";
    wrapper.style.justifyContent = "flex-start";
    wrapper.style.overflowX = "auto";
    wrapper.style.overflowY = "hidden";
    layout.style.transform = "none";
    layout.style.transformOrigin = "left top";

    if (activeRound) {
      const activeEl = bracket.querySelector(
        `.bracket-round[data-round="${cssEscape(activeRound)}"]`,
      );
      activeEl?.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "start",
      });
    }
    return;
  }

  // On desktop restore all rounds (they were possibly hidden by mobile tabs)
  const allRounds = bracket.querySelectorAll(".bracket-round");
  allRounds.forEach((r) => {
    r.style.display = "";
  });

  wrapper.style.display = "flex";
  wrapper.style.justifyContent = "center";
  wrapper.style.overflow = "hidden";
}
function renderBracketMatch(match) {
  const result = STATE.results[match.matchId];
  const venue = getVenueDetails(match);
  const kickoff = formatKickoff(match);
  const status = result ? normalizeResultStatus(result.status) : "SCHEDULED";
  const score =
    result && hasResult(result)
      ? `${result.score1 ?? "-"}-${result.score2 ?? "-"}`
      : "VS";

  const seedOverride = R32_SEED_MAP[String(match.matchId)];
  const team1 = getBracketTeamDisplay(
    seedOverride ? seedOverride.team1 : match.team1,
    result,
    "team1",
  );
  const team2 = getBracketTeamDisplay(
    seedOverride ? seedOverride.team2 : match.team2,
    result,
    "team2",
  );

  return `
    <article class="bracket-match ${getBracketMatchStateClass(result)}">
      <div class="bracket-match-meta">
        <span class="bracket-match-kickoff">${escapeHtml(kickoff)}</span>
        <a class="bracket-match-venue" href="${venue.mapsUrl}" target="_blank" rel="noopener noreferrer">
          <strong>${escapeHtml(venue.stadium)}</strong>
          <span>${escapeHtml(venue.city)}</span>
        </a>
      </div>

      <div class="bracket-match-body">
        <div class="bracket-seed ${team1.stateClass}">
          <span class="team-code">${escapeHtml(team1.code)}</span>
          <span class="team-flag">${team1.flag}</span>
          <span class="team-name">${escapeHtml(team1.name)}</span>
        </div>

        <div class="bracket-score">${escapeHtml(score)}</div>

        <div class="bracket-seed ${team2.stateClass}">
          <span class="team-code">${escapeHtml(team2.code)}</span>
          <span class="team-flag">${team2.flag}</span>
          <span class="team-name">${escapeHtml(team2.name)}</span>
        </div>
      </div>

      <div class="bracket-match-footer">
        <span class="bracket-status-token">${escapeHtml(status)}</span>
      </div>
    </article>
  `;
}

function getBracketTeamDisplay(seed, result, side) {
  const raw = String(seed || "").trim();
  const isReference = isBracketReference(raw);
  const resolved = isReference ? resolveSlot(raw) : raw;
  const isResolved =
    !isReference || (resolved && resolved !== raw && resolved !== "TBD");
  const name = isResolved ? resolved : "TBD";
  const team = {
    name,
    code: isResolved ? getTeamCode(name) : "TBD",
    flag: isResolved ? getFlagImg(name) : "",
    stateClass: isResolved ? "" : "is-tbd",
  };

  const winnerSide = getBracketWinnerSide(result);
  if (winnerSide && isFinalStatus(result?.status)) {
    if (winnerSide === side) team.stateClass = "is-winner";
    else team.stateClass = "is-loser";
  }

  return team;
}

function getBracketWinnerSide(result) {
  if (!result || !hasResult(result)) return "";
  const score1 = Number(result.score1);
  const score2 = Number(result.score2);
  if (Number.isFinite(score1) && Number.isFinite(score2)) {
    if (score1 > score2) return "team1";
    if (score2 > score1) return "team2";
  }
  if (String(result.penalty_winner || "").toLowerCase() === "team1")
    return "team1";
  if (String(result.penalty_winner || "").toLowerCase() === "team2")
    return "team2";
  return "";
}

function getBracketMatchStateClass(result) {
  if (!result) return "scheduled";
  if (isFinalStatus(result.status)) return "final";
  if (isLiveStatus(result.status)) return "live";
  return "scheduled";
}

function isBracketReference(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "TBD") return false;
  // Real team names always have spaces or length > 6 — never treat them as slot codes
  if (trimmed.includes(" ") || trimmed.length > 6) return false;
  // Slot codes: 1A, 2B, 3A/B/C, W74, L101
  return /^([12][A-L]|[WL]\d+|3[A-L\/]+)$/i.test(trimmed);
}
/**
 * Resolves a bracket slot code to a real team name using STATE.groupStandings
 * and STATE.results (for knockout-round dependencies). Handles:
 *   "1A"        → winner of Group A
 *   "2B"        → runner-up of Group B
 *   "3A/B/C/D" → best 3rd-place from those groups (pts → GD → GF)
 *   "W12"       → winner of match with matchId "12"
 *   "L12"       → loser of match with matchId "12" (used for the bronze match)
 * Returns the original code unchanged if standings/results are not yet available.
 */
function resolveSlot(code) {
  if (!code || typeof code !== "string") return code;
  const trimmed = code.trim();
  if (!trimmed || trimmed === "TBD") return trimmed;

  // --- Winner/loser of a prior match: W12, L12 ---
  const knockoutRef = trimmed.match(/^([WL])(\d+)$/);
  if (knockoutRef) {
    const [, side, refMatchId] = knockoutRef;
    const refFixture = STATE.fixtures.find(
      (f) => String(f.matchId) === refMatchId,
    );
    const refResult = STATE.results[refMatchId];
    if (!refFixture || !refResult || !isFinalResult(refResult)) return trimmed;
    const { score1, score2 } = refResult;
    let winnerIsTeam1;
    if (score1 > score2) winnerIsTeam1 = true;
    else if (score2 > score1) winnerIsTeam1 = false;
    else if (refResult.penalty_winner === "team1") winnerIsTeam1 = true;
    else if (refResult.penalty_winner === "team2") winnerIsTeam1 = false;
    else return trimmed;
    const winnerTeam = winnerIsTeam1 ? refFixture.team1 : refFixture.team2;
    const loserTeam = winnerIsTeam1 ? refFixture.team2 : refFixture.team1;
    const resolvedWinner = resolveSlot(winnerTeam);
    const resolvedLoser = resolveSlot(loserTeam);
    return side === "W" ? resolvedWinner : resolvedLoser;
  }

  // --- Simple group slot: 1A, 2B ---
  const groupMatch = trimmed.match(/^([12])([A-L])$/);
  if (groupMatch) {
    const pos = Number(groupMatch[1]) - 1;
    const groupKey = groupMatch[2];
    const groups = STATE.groupStandings || {};
    const groupData = groups[groupKey] || groups[`Group ${groupKey}`];
    if (!groupData || !groupData[pos]) return trimmed;
    return groupData[pos].team_name || trimmed;
  }

  // --- Third‑place slot: "3A/B/C/D/F", "3B/E/F/I/J", etc. ---
  // First check if we have a global ranking computed
  if (!STATE.thirdPlaceRanking) {
    // Compute it once and cache
    STATE.thirdPlaceRanking = computeThirdPlaceRanking();
  }

  const slotIndex = THIRD_PLACE_SLOT_ORDER.indexOf(trimmed);
  if (slotIndex !== -1) {
    // Extract eligible group letters from the slot code e.g. "3A/B/C/D/F" → ["A","B","C","D","F"]
    const letters = trimmed.replace(/^3/, "").split("/").filter(Boolean);
    // Filter the global ranking to only teams from eligible groups
    const eligible = STATE.thirdPlaceRanking.filter((t) =>
      letters.some((l) => t.group === l || t.group === `Group ${l}`),
    );
    if (eligible.length > 0) return eligible[0].team_name;
  }
  // Fallback: if the slot is not in our list (shouldn't happen), use the old logic
  const clean = trimmed.replace(/^3RD\s*/i, "").replace(/\s/g, "");
  const thirdMatch = clean.match(/^3([A-L\/]+)$/i);
  if (thirdMatch) {
    let letters = thirdMatch[1].split("/").filter(Boolean);
    if (letters.length === 1 && !thirdMatch[1].includes("/")) {
      letters = letters[0].split("");
    }
    if (!letters.length) return trimmed;
    const candidates = [];
    letters.forEach((l) => {
      const groupData =
        STATE.groupStandings[l] || STATE.groupStandings[`Group ${l}`];
      if (groupData) {
        const third = groupData.find((t) => t.position === 3);
        if (third) candidates.push(third);
      }
    });
    candidates.sort(
      (a, b) =>
        (b.points || 0) - (a.points || 0) ||
        (b.goal_difference || 0) - (a.goal_difference || 0) ||
        (b.goals_for || 0) - (a.goals_for || 0),
    );
    return candidates.length ? candidates[0].team_name : trimmed;
  }

  return trimmed;
}
function computeThirdPlaceRanking() {
  const groups = STATE.groupStandings || {};
  const thirdPlaceTeams = [];

  for (const [groupName, standings] of Object.entries(groups)) {
    const third = standings.find((t) => t.position === 3);
    if (third) {
      thirdPlaceTeams.push({
        group: groupName,
        team_name: third.team_name,
        points: third.points || 0,
        goal_difference: third.goal_difference || 0,
        goals_for: third.goals_for || 0,
      });
    }
  }

  // Sort by points desc, GD desc, GF desc
  thirdPlaceTeams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goal_difference !== a.goal_difference)
      return b.goal_difference - a.goal_difference;
    return b.goals_for - a.goals_for;
  });

  return thirdPlaceTeams;
}
function renderAdmin() {
  const container = document.getElementById("admin-content");
  if (!container || !SESSION.isAdmin) return;
  if (!STATE.accountRequests.length) requestSync(); // ensure requests are loaded

  container.innerHTML = `
    <div class="admin-grid">
      <button class="btn-primary sync-btn" type="button" onclick="requestSync()">Refresh Data</button>
      <button class="btn-primary sync-btn" type="button" onclick="toggleSettings(true)" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.25); color: var(--light);">System Settings</button>
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
    <div class="admin-section">
      <h3>Pending account requests</h3>
      ${renderAccountRequests()}
    </div>
  `;

  updateAdminBadge();
}

function updateAdminBadge() {
  const badge = document.getElementById("admin-request-badge");
  if (!badge || !SESSION.isAdmin) return;

  const pendingCount = STATE.accountRequests.filter(
    (request) => request.status === "pending",
  ).length;

  if (!pendingCount) {
    badge.hidden = true;
    badge.textContent = "0";
    return;
  }

  badge.hidden = false;
  badge.textContent = String(pendingCount);
}

function renderAccountRequests() {
  const pending = STATE.accountRequests.filter(
    (request) => request.status === "pending",
  );

  if (!pending.length) {
    return `<div class="empty-state compact"><p>No pending requests right now.</p></div>`;
  }

  return `
    <div class="request-list">
      ${pending
        .map(
          (request) => `
            <article class="request-card">
              <div>
                <strong>${escapeHtml(request.displayName || request.username)}</strong>
                <p>@${escapeHtml(request.username)}</p>
                ${request.note ? `<small>${escapeHtml(request.note)}</small>` : ""}
              </div>
              <div class="request-actions">
                <button class="btn-primary" type="button" onclick="approveAccountRequest('${escapeHtml(request.username)}')">Approve</button>
                <button class="btn-secondary" type="button" onclick="rejectAccountRequest('${escapeHtml(request.username)}')">Reject</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function generateAccessCode(username) {
  const seed = `${username}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return btoa(seed)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
}

async function approveAccountRequest(username) {
  try {
    let requestData = null;

    // Load from Supabase first
    try {
      const reqs = await supabaseSelect(
        "accountRequests",
        "*",
        `username=eq.${encodeURIComponent(username)}`,
      );
      if (reqs && reqs.length) {
        requestData = reqs[0];
      }
    } catch (e) {
      console.warn("Supabase request load failed:", e.message);
    }

    // Fallback to Firestore
    if (!requestData && db) {
      const requestDoc = db.collection("accountRequests").doc(username);
      const requestSnap = await requestDoc.get();
      if (requestSnap.exists) {
        requestData = requestSnap.data();
      }
    }

    if (!requestData) {
      showToast("Request not found.", "error");
      return;
    }

    const secretCode = generateAccessCode(username);
    const workerUrl = CONFIG.workerUrl
      ? CONFIG.workerUrl.replace(/\/$/, "") + "/admin/approve-request"
      : null;
    const token = CONFIG.seedToken || "";

    // Delegate DB writes + email to the worker (keeps API key server-side)
    if (workerUrl && token) {
      const resp = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username,
          displayName: requestData.displayName || username,
          email: requestData.email || "",
          secretCode,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Worker approve failed: ${err}`);
      }
    } else {
      // Fallback: write directly to Supabase (no email sent)
      const userRow = {
        username,
        displayName: requestData.displayName || username,
        secretCode,
        isAdmin: false,
        joinedAt: new Date().toISOString(),
      };
      const reqUpdateRow = {
        username,
        status: "approved",
        approvedAt: new Date().toISOString(),
        secretCode,
      };
      await supabaseUpsert("users", [userRow], "username");
      await supabaseUpsert("accountRequests", [reqUpdateRow], "username");
    }

    // Mirror to Firestore (optional)
    if (db) {
      try {
        const userDoc = db.collection("users").doc(username);
        const requestDoc = db.collection("accountRequests").doc(username);
        await userDoc.set(
          {
            username,
            displayName: requestData.displayName || username,
            secretCode,
            isAdmin: false,
            accountStatus: "approved",
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        await requestDoc.set(
          {
            status: "approved",
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            secretCode,
          },
          { merge: true },
        );
      } catch (error) {
        console.warn("Firestore mirror failed (non-critical):", error);
      }
    }

    showToast(`Approved ${username}. Code: ${secretCode}`, "success");
    await loadAccountRequests();
    renderAdmin();
  } catch (error) {
    console.error("Could not approve account request:", error);
    showToast("Approval failed.", "error");
  }
}

async function rejectAccountRequest(username) {
  try {
    let requestData = null;

    // Load request to get email
    try {
      const reqs = await supabaseSelect(
        "accountRequests",
        "*",
        `username=eq.${encodeURIComponent(username)}`,
      );
      if (reqs && reqs.length) requestData = reqs[0];
    } catch (e) {
      console.warn("Supabase request load failed:", e.message);
    }
    if (!requestData && db) {
      const snap = await db.collection("accountRequests").doc(username).get();
      if (snap.exists) requestData = snap.data();
    }

    const workerUrl = CONFIG.workerUrl
      ? CONFIG.workerUrl.replace(/\/$/, "") + "/admin/reject-request"
      : null;
    const token = CONFIG.seedToken || "";

    if (workerUrl && token && requestData?.email) {
      const resp = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username,
          displayName: requestData.displayName || username,
          email: requestData.email,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Worker reject failed: ${err}`);
      }
    } else {
      // Fallback: write directly (no email sent if no email on file)
      const reqUpdateRow = {
        username,
        status: "rejected",
        rejectedAt: new Date().toISOString(),
      };
      await supabaseUpsert("accountRequests", [reqUpdateRow], "username");
      if (db) {
        try {
          await db.collection("accountRequests").doc(username).set(
            {
              status: "rejected",
              rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        } catch (error) {
          console.error("Firestore rejection failed:", error);
        }
      }
    }

    showToast(`Rejected ${username}.`, "warning");
    await loadAccountRequests();
    renderAdmin();
  } catch (error) {
    console.error("Could not reject account request:", error);
    showToast("Rejection failed.", "error");
  }
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
  if (date && time) {
    const match = String(time).match(
      /(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2}(?:\.\d+)?)/i,
    );
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      const offset = Number(match[3]);
      const [y, m, d] = date.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d, hour - offset, minute));
    }

    const fallbackMatch = String(time).match(/^(\d{1,2}):(\d{2})$/);
    if (fallbackMatch) {
      const hour = Number(fallbackMatch[1]);
      const minute = Number(fallbackMatch[2]);
      const [y, m, d] = date.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d, hour, minute));
    }
  }

  if (kickoffUTC && String(kickoffUTC).includes("T")) {
    const parsed = new Date(kickoffUTC);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}
const TEAM_FLAG_CODES = {
  mexico: "mx",
  "south africa": "za",
  "south korea": "kr",
  "czech republic": "cz",
  canada: "ca",
  "bosnia & herzegovina": "ba",
  "bosnia and herzegovina": "ba",
  bosnia: "ba",
  "united states": "us",
  "united states of america": "us",
  "dr congo": "cd",
  "dr congo": "cd",
  "democratic republic of the congo": "cd",
  "democratic republic of congo": "cd",
  congo: "cd",
  usa: "us",
  paraguay: "py",
  qatar: "qa",
  switzerland: "ch",
  brazil: "br",
  morocco: "ma",
  haiti: "ht",
  scotland: "gb-sct",
  australia: "au",
  turkey: "tr",
  germany: "de",
  curaçao: "cw",
  netherlands: "nl",
  japan: "jp",
  "ivory coast": "ci",
  ecuador: "ec",
  sweden: "se",
  tunisia: "tn",
  belgium: "be",
  egypt: "eg",
  iran: "ir",
  "new zealand": "nz",
  spain: "es",
  "cape verde": "cv",
  "saudi arabia": "sa",
  uruguay: "uy",
  france: "fr",
  senegal: "sn",
  iraq: "iq",
  norway: "no",
  argentina: "ar",
  algeria: "dz",
  austria: "at",
  jordan: "jo",
  portugal: "pt",
  "dr congo": "cd",
  uzbekistan: "uz",
  colombia: "co",
  england: "gb-eng",
  croatia: "hr",
  ghana: "gh",
  panama: "pa",
};

function getFlagImg(teamName) {
  const code = TEAM_FLAG_CODES[String(teamName).toLowerCase().trim()];
  if (!code) return "";
  return `<img class="inline-flag-img" src="https://flagcdn.com/w80/${code}.png" alt="${escapeHtml(teamName)}" width="40" height="27">`;
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
    const data = await fetchGameDataApi(["/sync", "?action=sync"]);

    if (Array.isArray(data.fixtures) && data.fixtures.length) {
      STATE.fixtures = sortFixtures(data.fixtures.map(normalizeFixture));
    }
    if (data.results) {
      STATE.results = resultsWithScores(data.results);
    }
    if (Array.isArray(data.leaderboard)) {
      STATE.leaderboard = data.leaderboard;
    }
    if (data.groupStandings) {
      STATE.groupStandings = normalizeGroupStandingsPayload(
        data.groupStandings,
      );
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
    const data = await fetchGameDataApi(["/fixtures", "?action=fixtures"]);
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
    const data = await fetchGameDataApi(["/sync", "?action=sync"]);
    return resultsWithScores(data.results);
  } catch (error) {
    console.warn("Results API unavailable.", error.message);
    return {};
  }
}
async function loadLeaderboardFromApi() {
  try {
    const data = await fetchGameDataApi([
      "/leaderboard",
      "?action=leaderboard",
    ]);

    return Array.isArray(data.leaderboard) ? data.leaderboard : [];
  } catch (error) {
    console.error("Leaderboard API failed:", error);
    return [];
  }
}

function buildGameDataApiUrl(endpoint) {
  const base = CONFIG.appsScriptUrl.replace(/\/$/, "");
  return endpoint.startsWith("?") ? `${base}${endpoint}` : `${base}${endpoint}`;
}

async function fetchGameDataApi(endpoints) {
  let lastError = null;

  for (const endpoint of endpoints) {
    const url = buildGameDataApiUrl(endpoint);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("No game data API endpoint configured");
}

async function loadGroupStandings() {
  STATE.thirdPlaceRanking = null; // clear cache
  STATE.groupStandings = normalizeGroupStandingsPayload(STATE.groupStandings);
  if (Object.keys(STATE.groupStandings).length) return;

  try {
    const data = await supabaseSelect(
      "group_standings",
      "*",
      "order=group_name.asc,position.asc",
    );
    STATE.groupStandings = normalizeGroupStandingsPayload(data);
  } catch (error) {
    console.warn("Could not load Supabase group standings.", error.message);
    STATE.groupStandings = {};
  }
}

function resultsWithScores(results) {
  const normalized = normalizeResultsPayload(results);
  return Object.entries(normalized).reduce((acc, [matchId, result]) => {
    if (hasResult(result)) acc[matchId] = result;
    return acc;
  }, {});
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

function normalizeGroupStandingsPayload(payload) {
  const groups = {};
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? Object.values(payload).flat()
      : [];

  rows.forEach((row) => {
    const groupName = String(row.group_name || row.group || "").trim();
    if (!groupName) return;
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push({
      group_name: groupName,
      team_id: String(row.team_id || ""),
      team_name: row.team_name || row.teamName || row.name || "TBD",
      position: numberOrZero(row.position),
      played: numberOrZero(row.played),
      won: numberOrZero(row.won),
      drawn: numberOrZero(row.drawn),
      lost: numberOrZero(row.lost),
      goals_for: numberOrZero(row.goals_for),
      goals_against: numberOrZero(row.goals_against),
      goal_difference: numberOrZero(row.goal_difference),
      points: numberOrZero(row.points),
      updated_at: row.updated_at || null,
    });
  });

  Object.keys(groups).forEach((groupName) => {
    groups[groupName].sort(
      (a, b) =>
        a.position - b.position ||
        String(a.team_name).localeCompare(String(b.team_name)),
    );
  });

  return Object.fromEntries(
    Object.entries(groups).sort(([a], [b]) =>
      String(a).localeCompare(String(b)),
    ),
  );
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
  return Date.now() >= match.kickoffDate.getTime() - 1 * 60 * 1000;
}

function getMatchStatus(match, result) {
  if (result && isFinalStatus(result.status))
    return { label: "Final", className: "locked" };
  if (result && isLiveStatus(result.status)) {
    const statusLabel = String(result.status).toUpperCase();
    return {
      label: `Live${statusLabel && statusLabel !== "LIVE" ? ` - ${statusLabel}` : ""}`,
      className: "live",
    };
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
  if (!result) return false;
  if (!Number.isFinite(result.score1) || !Number.isFinite(result.score2))
    return false;
  const status = String(result.status || "").toUpperCase();
  if (status === "NS" || status === "") return false;
  return isLiveStatus(status) || isFinalStatus(status);
}

/**
 * Client-side scoring - mirrors canonical scoreMatch on the backend.
 * Points: exact=15, correct result plus close goal difference=8,
 * correct result=5, wrong result=0.
 */
function calculateMatchPoints(
  pred1,
  pred2,
  actual1,
  actual2,
  stage = "group",
  penWinner = null,
  actualPenWinner = null,
) {
  const resultStage = String(stage || "group").toLowerCase();
  const multiplierMap = {
    group: 1,
    r32: 2,
    r16: 2.5,
    qf: 3,
    sf: 4,
    third: 4,
    final: 5,
  };
  const multiplier = multiplierMap[resultStage] ?? 1;
  const isKnockout = resultStage !== "group" && resultStage !== "";

  if (isKnockout && actualPenWinner) {
    // Penalty shootout decided this match
    const userPredictedDraw = pred1 === pred2;
    if (userPredictedDraw) {
      return penWinner === actualPenWinner ? 15 * multiplier : 0;
    } else {
      const predWinner = pred1 > pred2 ? "team1" : "team2";
      return predWinner === actualPenWinner ? 5 * multiplier : 0;
    }
  }

  if (pred1 === actual1 && pred2 === actual2) return 15 * multiplier;
  const predOutcome = Math.sign(pred1 - pred2);
  const actualOutcome = Math.sign(actual1 - actual2);
  if (predOutcome === actualOutcome) {
    const diffGap = Math.abs(pred1 - pred2 - (actual1 - actual2));
    return (diffGap <= 1 ? 8 : 5) * multiplier;
  }
  return 0;
}

// ================================================================
// 2. buildLocalLocalLeaderboard() – update to track completedPredictions
//    (used as fallback when no server leaderboard exists)
// ================================================================
function buildLocalLeaderboard() {
  if (!SESSION.username) return [];

  let totalPoints = 0;
  let exactScores = 0;
  let correctOutcomes = 0;
  let predicted = 0;
  let completedPredictions = 0; // NEW

  Object.values(STATE.predictions).forEach((prediction) => {
    if (!hasPrediction(prediction)) return;
    predicted += 1;

    const result = STATE.results[String(prediction.matchId)];
    if (!hasResult(result)) return;

    completedPredictions += 1; // NEW: only count predictions that have a result

    const fixture = STATE.fixtures?.find(
      (f) => String(f.matchId) === String(prediction.matchId),
    );
    const points = calculateMatchPoints(
      prediction.pred1,
      prediction.pred2,
      result.score1,
      result.score2,
      fixture?.stage,
      prediction.pen_winner,
      result.penalty_winner,
    );
    totalPoints += points;
    if (
      prediction.pred1 === result.score1 &&
      prediction.pred2 === result.score2
    )
      exactScores += 1;
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
      scored: completedPredictions,
      completedPredictions, // NEW
    },
  ];
}

function formatKickoff(match) {
  const fixtureLocal = formatFixtureLocalKickoff(match);
  if (fixtureLocal) return fixtureLocal;

  if (!match.kickoffDate)
    return `${match.date || ""} ${match.time || ""}`.trim();

  return match.kickoffDate.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Cairo",
  });
}

function formatFixtureLocalKickoff(match) {
  if (!match.date || !match.time) return "";

  const parsedDate = String(match.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedTime = String(match.time).match(
    /^(\d{1,2}):(\d{2})(?:\s+UTC([+-]\d{1,2}(?:\.\d+)?))?$/i,
  );
  if (!parsedDate || !parsedTime) return "";

  const hour = Number(parsedTime[1]);
  const minute = Number(parsedTime[2]);
  const offsetHours = parsedTime[3] ? Number(parsedTime[3]) : 0;

  // Convert venue local time to UTC, then display in Cairo
  const utcMs = Date.UTC(
    Number(parsedDate[1]),
    Number(parsedDate[2]) - 1,
    Number(parsedDate[3]),
    hour - offsetHours,
    minute,
  );

  return new Date(utcMs).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Cairo",
    hour12: true,
  });
}

function formatFixtureLocalDate(match) {
  if (!match.date) return "";
  const parsedDate = String(match.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parsedDate) return "";

  return new Date(
    Date.UTC(
      Number(parsedDate[1]),
      Number(parsedDate[2]) - 1,
      Number(parsedDate[3]),
    ),
  ).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
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
  if (!teamName || teamName === "TBD") return "TBD";
  const key = normalizeTeamKey(teamName);
  const code = STATE.teams[key];
  if (code) return code;
  // Fallback: short code from name
  return shortTeamCode(teamName);
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
function toggleCalendarModal(show) {
  const modal = document.getElementById("calendar-modal");
  if (!modal) return;
  if (show) {
    modal.classList.add("show");
  } else {
    modal.classList.remove("show");
  }
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

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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
function toggleSidebar(open) {
  document.getElementById("sidebar").classList.toggle("open", open);
  document.getElementById("sidebar-overlay").classList.toggle("open", open);
  document.body.style.overflow = open ? "hidden" : "";
}

function showNavChangeBanner() {
  if (localStorage.getItem("ggo_nav_banner_seen")) return;
  const banner = document.getElementById("nav-change-banner");
  if (banner) banner.style.display = "flex";
}
function isFinalResult(result) {
  if (!result) return false;
  const status = String(result.status || "").toUpperCase();
  return ["FT", "AET", "PEN", "COMPLETED", "FINAL"].includes(status);
}
