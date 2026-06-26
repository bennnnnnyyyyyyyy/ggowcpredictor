// Reads ?user= from URL, fetches data from Worker /profile endpoint,
// falls back to Supabase direct, then Firestore.

// ─── Config (mirrors app.js) ────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyAVBLnjdM4cV9vBwV27dl6bEc4ZqVjuFBw",
  authDomain: "ggowcpredictor.firebaseapp.com",
  projectId: "ggowcpredictor",
  storageBucket: "ggowcpredictor.firebasestorage.app",
  messagingSenderId: "126058028551",
  appId: "1:126058028551:web:e60b6e211c3e2e56e154a2",
};

const supabaseConfig = {
  url: "https://nthnysznieivbkncpqrk.supabase.co",
  key: "sb_publishable_q4iEOMH_S09dgmg3mHtK-w_08jFDVUo",
};

// ─── Supabase helpers ────────────────────────────────────────────────────────

function sbHeaders(extra = {}) {
  return Object.assign(
    {
      apikey: supabaseConfig.key,
      Authorization: `Bearer ${supabaseConfig.key}`,
    },
    extra,
  );
}

async function sbSelect(table, selectQ = "*", filterQ = "") {
  let qs = `select=${encodeURIComponent(selectQ)}`;
  if (filterQ) qs += `&${filterQ}`;
  const base = supabaseConfig.url.replace(/\/$/, "");
  const res = await fetch(`${base}/rest/v1/${table}?${qs}`, {
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(`Supabase ${table} HTTP ${res.status}`);
  return res.json();
}

// ─── Firebase ────────────────────────────────────────────────────────────────

let db = null;
function initFirebase() {
  if (!window.firebase?.initializeApp) return;
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  } catch (e) {
    console.warn("Firebase init failed:", e.message);
  }
}

// ─── Scoring (mirrors scoreMatch on the backend) ────────────────────────────
// Exact score = 15, correct outcome + GD within 1 = 8, correct outcome only = 5, wrong outcome = 0.
const STAGE_MULTIPLIERS = {
  group: 1,
  r32: 2,
  r16: 2.5,
  qf: 3,
  sf: 4,
  third: 4,
  final: 5,
};

function calcPoints(p1, p2, a1, a2, stage = "group") {
  const multiplier = STAGE_MULTIPLIERS[String(stage || "group").toLowerCase()] ?? 1;
  if (p1 === a1 && p2 === a2) return 15 * multiplier;
  const po = Math.sign(p1 - p2);
  const ao = Math.sign(a1 - a2);
  if (po === ao) return (Math.abs((p1 - p2) - (a1 - a2)) <= 1 ? 8 : 5) * multiplier;
  return 0;
}

function isLiveStatus(s = "") {
  return ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(
    String(s).toUpperCase(),
  );
}
function isFinalStatus(s = "") {
  return ["FT", "AET", "PEN", "COMPLETED", "FINAL"].includes(
    String(s).toUpperCase(),
  );
}
function hasResult(r) {
  if (!r) return false;
  if (!Number.isFinite(r.score1) || !Number.isFinite(r.score2)) return false;
  const s = String(r.status || "").toUpperCase();
  return s !== "NS" && (isLiveStatus(s) || isFinalStatus(s));
}

function nullNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Data fetching ───────────────────────────────────────────────────────────

function getWorkerUrl() {
  return (
    localStorage.getItem("ggo_wc_url") ||
    "https://ggowcpredictor.ben-arthur-wiz.workers.dev"
  ).replace(/\/$/, "");
}

async function fetchProfileFromWorker(username) {
  const url = `${getWorkerUrl()}/profile?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Worker /profile HTTP ${res.status}`);
  return res.json();
}

async function fetchProfileFromSupabase(username) {
  const [users, preds, leaderboard, fixtures, results] = await Promise.all([
    sbSelect("users", "*", `username=eq.${encodeURIComponent(username)}`),
    sbSelect(
      "predictions",
      "*",
      `username=eq.${encodeURIComponent(username)}&order=matchId.asc`,
    ),
    sbSelect("leaderboard", "*", `username=eq.${encodeURIComponent(username)}`),
    sbSelect("fixtures", "*"),
    sbSelect("results", "*"),
  ]);

  const user = users?.[0];
  if (!user) throw new Error("User not found in Supabase");

  const lb = leaderboard?.[0] || {};
  const fixtureMap = {};
  (fixtures || []).forEach((f) => {
    const id = String(f.matchId || f.id || "").replace(/^match_/, "");
    if (id) fixtureMap[id] = f;
  });
  const resultMap = {};
  (results || []).forEach((r) => {
    const id = String(r.matchId || r.id || "").replace(/^match_/, "");
    if (id) resultMap[id] = r;
  });

  return buildProfilePayload(user, lb, preds || [], fixtureMap, resultMap);
}

async function fetchProfileFromFirestore(username) {
  if (!db) throw new Error("Firestore not initialized");

  const [userSnap, predsSnap, currentSnap, fixturesSnap, resultsSnap] =
    await Promise.all([
      db.collection("users").doc(username).get(),
      db.collection("predictions").where("username", "==", username).get(),
      db.collection("leaderboard").doc("current").get(),
      db.collection("fixtures").get(),
      db.collection("results").get(),
    ]);

  if (!userSnap.exists) throw new Error("User not found in Firestore");

  const user = { username, ...userSnap.data() };
  const preds = predsSnap.docs.map((d) => d.data());

  const lb = {};
  if (currentSnap.exists) {
    const players = currentSnap.data().players || [];
    const found = players.find((p) => p.username === username);
    if (found) Object.assign(lb, found);
  }

  const fixtureMap = {};
  fixturesSnap.docs.forEach((d) => {
    const f = { id: d.id, ...d.data() };
    const id = String(f.matchId || f.id || "").replace(/^match_/, "");
    if (id) fixtureMap[id] = f;
  });
  const resultMap = {};
  resultsSnap.docs.forEach((d) => {
    const r = { id: d.id, ...d.data() };
    const id = String(r.matchId || r.id || "").replace(/^match_/, "");
    if (id) resultMap[id] = r;
  });

  return buildProfilePayload(user, lb, preds, fixtureMap, resultMap);
}

function buildProfilePayload(user, lb, preds, fixtureMap, resultMap) {
  let totalPoints = 0,
    exactScores = 0,
    correctOutcomes = 0;

  const predictions = preds
    .filter((p) => p.matchId != null)
    .map((p) => {
      const matchId = String(p.matchId).replace(/^match_/, "");
      const fixture = fixtureMap[matchId] || {};
      const result = resultMap[matchId];

      const pred1 = nullNum(p.pred1);
      const pred2 = nullNum(p.pred2);
      const hasPred = pred1 !== null && pred2 !== null;

      let actualHome = null,
        actualAway = null,
        points = null,
        statusType = "upcoming";
      if (result) {
        actualHome = nullNum(
          result.score1 ?? result.homeScore ?? result.team1Score,
        );
        actualAway = nullNum(
          result.score2 ?? result.awayScore ?? result.team2Score,
        );
        const status = String(result.status || "NS").toUpperCase();
        if (isFinalStatus(status)) statusType = "finished";
        else if (isLiveStatus(status)) statusType = "live";
      }

      if (hasPred && actualHome !== null && actualAway !== null) {        points = calcPoints(pred1, pred2, actualHome, actualAway, fixture.stage);
        totalPoints += points;
        if (pred1 === actualHome && pred2 === actualAway) exactScores++;
        if (points > 0) correctOutcomes++;
      }

      return {
        matchId,
        home: fixture.team1 || "TBD",
        away: fixture.team2 || "TBD",
        group: fixture.group || "",
        round: fixture.round || "",
        date: fixture.date || "",
        time: fixture.time || "",
        predictedHome: hasPred ? pred1 : null,
        predictedAway: hasPred ? pred2 : null,
        actualHome,
        actualAway,
        points,
        status: String(result?.status || "NS").toUpperCase(),
        statusType,
      };
    })
    .sort((a, b) => {
      // finished first (by matchId desc), then live, then upcoming
      const order = { finished: 0, live: 1, upcoming: 2 };
      const od = (order[a.statusType] ?? 3) - (order[b.statusType] ?? 3);
      if (od !== 0) return od;
      return Number(a.matchId) - Number(b.matchId);
    });

  const rank = lb.rank ?? null;

  return {
    user: {
      username: user.username,
      displayName: user.displayName || user.username,
      isAdmin: Boolean(user.isAdmin),
      totalPoints: totalPoints,
      exactScores: exactScores,
      correctOutcomes: correctOutcomes,
      predicted: preds.length,
      rank,
    },
    predictions,
  };
}

// ─── Main data loader (waterfall) ────────────────────────────────────────────

async function loadProfile(username) {
  // 1. Try Supabase direct first so the profile matches the main app data path.
  try {
    return await fetchProfileFromSupabase(username);
  } catch (e) {
    console.warn("Supabase profile fetch failed:", e.message);
  }

  // 2. Try Worker /profile endpoint as a fallback.
  try {
    return await fetchProfileFromWorker(username);
  } catch (e) {
    console.warn("Worker /profile unavailable:", e.message);
  }

  // 3. Firestore fallback
  return fetchProfileFromFirestore(username);
}
async function loadRivalry(username) {
  try {
    const workerUrl = (
      localStorage.getItem("ggo_wc_url") ||
      "https://ggowcpredictor.ben-arthur-wiz.workers.dev"
    ).replace(/\/$/, "");
    const res = await fetch(
      `${workerUrl}/rivalry?username=${encodeURIComponent(username)}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (e) {
    console.warn("Rivalry fetch failed:", e.message);
    return null;
  }
}
// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getInitials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function rankChipClass(rank) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "";
}

function ptsTierClass(pts) {
  if (pts === null) return "pts-pending";
  if (pts >= 15) return "pts-exact";
  if (pts >= 8) return "pts-good";
  if (pts > 0) return "pts-partial";
  return "pts-zero";
}

function stripeClass(pts, statusType) {
  if (statusType !== "finished" && statusType !== "live")
    return "stripe-pending";
  if (pts === null) return "stripe-pending";
  if (pts >= 15) return "stripe-exact";
  if (pts >= 8) return "stripe-good";
  if (pts > 0) return "stripe-partial";
  return "stripe-zero";
}

function formatPts(pts, statusType) {
  if (statusType === "upcoming")
    return `<span class="pred-pts pts-pending">Upcoming</span>`;
  if (statusType === "live" && pts === null)
    return `<span class="pred-pts pts-pending">Live</span>`;
  if (pts === null) return `<span class="pred-pts pts-pending">No pick</span>`;
  const cls = ptsTierClass(pts);
  return `<span class="pred-pts ${cls}">${pts}<sub>pts</sub></span>`;
}

function statusTagHtml(statusType, rawStatus) {
  if (statusType === "live") {
    return `<span class="pred-status-tag live"><span style="width:6px;height:6px;border-radius:50%;background:var(--warning);display:inline-block"></span>Live · ${esc(rawStatus)}</span>`;
  }
  if (statusType === "finished") {
    return `<span class="pred-status-tag finished">FT</span>`;
  }
  return `<span class="pred-status-tag upcoming">Upcoming</span>`;
}

function scoreDisplay(home, away, cls) {
  if (home === null || away === null) {
    return `<span class="pred-score-value no-pick">—</span>`;
  }
  return `<span class="pred-score-value ${cls}">${home}–${away}</span>`;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderProfile(data) {
  const { user, predictions } = data;
  const initials = getInitials(user.displayName);
  const rankLabel = user.rank ? `#${user.rank}` : "–";
  const rankCls = rankChipClass(user.rank);

  // Accuracy %
  const scored = predictions.filter((p) => p.points !== null).length;
  const correct = predictions.filter((p) => p.points > 0).length;
  const accuracy = scored > 0 ? Math.round((correct / scored) * 100) : 0;

  // Filter state
  let activeFilter = "all";

  function renderList(filter) {
    let list = predictions.filter((p) => p.statusType === "finished" || p.statusType === "live");
    if (filter === "finished")
      list = predictions.filter((p) => p.statusType === "finished");
    if (filter === "live")
      list = predictions.filter((p) => p.statusType === "live");
    if (filter === "upcoming")
      list = predictions.filter((p) => p.statusType === "upcoming");
    if (filter === "scoring") {
      list = predictions
        .filter((p) => p.points !== null)
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      // Scoring view: flat list by points, no date grouping
      if (!list.length) {
        return `<div class="empty-state"><div class="empty-icon">–</div><p>No scored predictions yet.</p></div>`;
      }
      return list.map((p) => renderPredCard(p, user.displayName)).join("");
    }

    if (!list.length) {
      return `<div class="empty-state"><div class="empty-icon">–</div><p>No predictions in this view.</p></div>`;
    }

    // Group by date (same as main app)
    const groups = {};
    list.forEach((p) => {
      const dateKey = p.date || "Unknown Date";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(p);
    });

        return Object.entries(groups)
      .sort(([a], [b]) => {
        if (a === "Unknown Date") return 1;
        if (b === "Unknown Date") return -1;
        return b.localeCompare(a);
      })
      .map(([dateKey, preds]) => {
        const dateLabel = formatProfileDate(dateKey);
        return `
        <div class="profile-date-group">
          <div class="profile-date-heading">${esc(dateLabel)}</div>
          ${preds.map((p) => renderPredCard(p, user.displayName)).join("")}
        </div>
      `;
      })
      .join("");
  }
  function renderPredCard(p, displayName) {
    const stripe = stripeClass(p.points, p.statusType);
    const ptsHtml = formatPts(p.points, p.statusType);
    const groupPart = p.group
      ? `<span class="pred-meta-tag"><span class="accent">${esc(p.group)}</span></span>`
      : "";
    const roundPart = p.round
      ? `<span class="pred-meta-tag">${esc(p.round)}</span>`
      : "";
    const datePart = p.date
      ? `<span class="pred-meta-tag">${esc(p.date)}</span>`
      : "";
    const hasPred = p.predictedHome !== null && p.predictedAway !== null;
    const firstName = (displayName || "").split(" ")[0];

    return `
    <article class="pred-card">
      <div class="pred-stripe ${stripe}"></div>
      <div class="pred-body">
        <div class="pred-matchup">
          <span class="pred-team">${esc(p.home)}</span>
          <span class="pred-vs">vs</span>
          <span class="pred-team">${esc(p.away)}</span>
        </div>
        ${ptsHtml}
        <div class="pred-scores">
          <div class="pred-score-row">
            <span class="pred-score-label">Result</span>
            ${scoreDisplay(p.actualHome, p.actualAway, "actual")}
          </div>
          <div class="pred-score-row">
            <span class="pred-score-label">${esc(firstName)}'s pick</span>
            ${hasPred ? scoreDisplay(p.predictedHome, p.predictedAway, "pick") : `<span class="pred-score-value no-pick">No pick</span>`}
          </div>
        </div>
        <div class="pred-meta">
          ${groupPart}${roundPart}${datePart}
          ${statusTagHtml(p.statusType, p.status)}
        </div>
      </div>
    </article>
  `;
  }
  function formatProfileDate(dateStr) {
    // dateStr = "2026-06-11"
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return dateStr;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  const html = `
    <a href="index.html" class="profile-back">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 3L5 8l5 5"/>
      </svg>
      Back to Predictor
    </a>

    <!-- ── Hero ── -->
    <div class="profile-hero">
      <div class="profile-hero-inner">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar">${esc(initials)}</div>
          ${user.rank ? `<div class="profile-rank-chip ${rankCls}">${esc(rankLabel)}</div>` : ""}
        </div>
        <div class="profile-hero-text">
          <div class="profile-display-name">${esc(user.displayName)}</div>
          <div class="profile-username">@<span>${esc(user.username)}</span></div>
          <div class="profile-badges">
            <span class="profile-badge">Rank ${esc(rankLabel)}</span>
            <span class="profile-badge">${esc(user.predicted || 0)} predictions</span>
            ${user.isAdmin ? `<span class="profile-badge admin-badge">Admin</span>` : ""}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Stats ── -->
    <div class="profile-stats-grid">
      <div class="stat-card stat-pts">
        <div class="stat-value">${user.totalPoints ?? 0}</div>
        <div class="stat-label">Total Points</div>
      </div>
      <div class="stat-card stat-exact">
        <div class="stat-value">${user.exactScores ?? 0}</div>
        <div class="stat-label">Exact Scores</div>
      </div>
      <div class="stat-card stat-outcome">
        <div class="stat-value">${user.correctOutcomes ?? 0}</div>
        <div class="stat-label">Correct Results</div>
      </div>
      <div class="stat-card stat-made">
        <div class="stat-value">${user.predicted ?? 0}</div>
        <div class="stat-label">Predictions Made</div>
      </div>
    </div>

    <!-- Accuracy bar -->
    ${
      scored > 0
        ? `
    <div class="accuracy-bar-wrap" style="margin-bottom:28px">
      <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">Scoring accuracy</span>
      <div class="accuracy-bar-track">
        <div class="accuracy-bar-fill" style="width:${accuracy}%"></div>
      </div>
      <span class="accuracy-label">${accuracy}%</span>
    </div>`
        : ""
    }

    

    <!-- ── Prediction history ── -->
    <div class="profile-section-title">
      <span>Prediction <span class="title-accent">History</span></span>
      <span class="profile-section-count" id="pred-count">${predictions.length}</span>
    </div>

    <div class="profile-filter-row">
      <button class="filter-btn active" onclick="setFilter('all', this)">All</button>
      <button class="filter-btn" onclick="setFilter('finished', this)">Finished</button>
      <button class="filter-btn" onclick="setFilter('live', this)">Live</button>
      <button class="filter-btn" onclick="setFilter('scoring', this)">Top Scores</button>
    </div>

    <div class="pred-history-list" id="pred-list">
      ${renderList("all")}
    </div>
  `;

  const content = document.getElementById("profile-content");
  content.innerHTML = html;
  content.style.display = "block";
  document.getElementById("profile-loading").style.display = "none";

  // Wire filter buttons (needs closure over predictions + renderList)
  window.setFilter = function (filter, btn) {
    activeFilter = filter;
    document
      .querySelectorAll(".profile-filter-row .filter-btn")
      .forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    const listEl = document.getElementById("pred-list");
    if (listEl) listEl.innerHTML = renderList(filter);

    // Update count badge
    const counts = {
      all: predictions.length,
      finished: 0,
      live: 0,
      upcoming: 0,
      scoring: 0,
    };
    predictions.forEach((p) => {
      if (p.statusType === "finished") counts.finished++;
      else if (p.statusType === "live") counts.live++;
      else counts.upcoming++;
      if (p.points !== null) counts.scoring++;
    });
    const countEl = document.getElementById("pred-count");
    if (countEl) countEl.textContent = counts[filter] ?? predictions.length;
  };
}

function renderError(message) {
  document.getElementById("profile-loading").style.display = "none";
  const content = document.getElementById("profile-content");
  content.innerHTML = `
    <a href="index.html" class="profile-back">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 3L5 8l5 5"/>
      </svg>
      Back to Predictor
    </a>
    <div class="profile-error">
      <div class="error-code">404</div>
      <p>${esc(message)}</p>
      <br>
      <a href="index.html" class="btn-primary" style="max-width:180px;display:inline-block;text-decoration:none;text-align:center">Return to App</a>
    </div>
  `;
  content.style.display = "block";
}

// ─── Boot ────────────────────────────────────────────────────────────────────

(async function init() {
  initFirebase();

  const params = new URLSearchParams(window.location.search);
  const username = (params.get("user") || "").trim().toLowerCase();

  if (!username) {
    renderError(
      "No username provided. Try clicking a player's name from the Leaderboard.",
    );
    return;
  }

  document.title = `${username} — GGO WC 2026`;

  try {
    // Single parallel load
    const [data, rivalry] = await Promise.all([
      loadProfile(username),
      loadRivalry(username),
    ]);

    if (!data?.user) {
      renderError(`Player "${username}" was not found.`);
      return;
    }
    renderProfile(data, rivalry);
  } catch (err) {
    console.error("Profile load failed:", err);
    renderError(
      `Could not load profile for "${username}". Check your connection or try again later.`,
    );
  }
})();




