# GGO WC Predictor — Latency Audit + Feature Roadmap
### Save-prediction lag · Email service · Per-match chat · Weekly recap emails · FotMob-style suggested predictions

---

## Part 1 — Audit: why saving a prediction takes 2–3 seconds

### Root cause

`savePrediction()` in `scripts/app.js` does two **sequential, blocking** network writes before the UI updates at all:

```js
// 1. Save to Supabase FIRST — must succeed
try {
  ...
  await supabaseUpsert("predictions", [row], "id");
} catch (error) {
  ...
  return;
}

// 2. Mirror to Firestore (optional, don't block on failure)
if (db) {
  try {
    await db.collection("predictions").doc(`${SESSION.username}_${matchId}`).set(...);
  } catch (error) { ... }
}

// 3. Update local state only AFTER successful Supabase write
STATE.predictions[String(matchId)] = prediction;
...
renderPredictions();
```

Walking through what actually happens on a tap:

1. User edits both score inputs → `handleScoreChange()` fires → calls `savePrediction()`.
2. `savePrediction()` `await`s a Supabase REST POST (typically 200–600ms from Cairo to Supabase's edge, more on a cold connection or congested network).
3. **Only after that resolves**, it `await`s a *second*, fully separate round-trip to Firestore (another 200–800ms, often slower since it's a full Firestore SDK write, not REST).
4. **Only after both complete** does it touch `STATE.predictions`, write to `localStorage`, show the toast, and call `renderPredictions()` / `renderGroupStandings()` / `renderLeaderboard()` — three full re-renders, all gated behind both network calls finishing.

So the score inputs visually "do nothing" for the full round-trip of two sequential writes, then three re-renders fire at once. On a slow connection (mobile data, VPN, whatever — your team is presumably on company wifi at best) this comfortably reaches 2-3 seconds. It's not a bug exactly — the logic is *correct* — it's just architected for correctness-first with zero attention to perceived latency.

There's a secondary, smaller cost: `handleScoreChange()` re-queries the DOM with `document.querySelector` twice per call to read both score inputs, and `savePrediction()` does a `STATE.fixtures.find()` linear scan over up to 104 fixtures every single save. Neither of these is the main 2-3s cost, but they add up if a user is rapidly correcting predictions across many matches in one sitting.

### The fix: optimistic UI + background sync

The standard pattern (this is also exactly how FotMob/SuperBru-style apps feel instant) is:

1. **Update local state and re-render immediately**, before any network call.
2. **Fire the network writes in the background** (don't block the UI on them).
3. **Only show an error/retry state if the write actually fails** — silently succeed in the common case, the user never has to wait.

Rewritten shape for `savePrediction()`:

```js
async function savePrediction(matchId, pred1, pred2) {
  const fixture = STATE.fixtures.find((match) => match.matchId === String(matchId));
  const score1 = Number(pred1);
  const score2 = Number(pred2);

  if (!fixture) return;
  if (isLocked(fixture)) {
    showToast("This match is locked.", "error");
    renderPredictions();
    return;
  }
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0) {
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

  // 1. OPTIMISTIC: update local state + re-render INSTANTLY, before any network call
  STATE.predictions[String(matchId)] = prediction;
  writeLocalObject(`ggo_wc_predictions_${SESSION.username || "demo"}`, STATE.predictions);
  showToast(`Saved: ${fixture.team1} ${score1}-${score2} ${fixture.team2}`);
  renderPredictions();
  renderGroupStandings();
  renderLeaderboard();

  // 2. Fire-and-forget network writes — UI already updated, don't block on these
  const docId = `${SESSION.username}_${matchId}`;
  const row = { id: docId, username: SESSION.username, matchId: String(matchId),
                pred1: score1, pred2: score2, submittedAt: prediction.submittedAt,
                pointsAwarded: null, scoredAt: null };

  supabaseUpsert("predictions", [row], "id").catch((error) => {
    console.error("Failed to save prediction to Supabase:", error);
    showToast("Sync failed — will retry automatically.", "error");
    queueFailedPredictionRetry(docId, row); // see below
  });

  if (db) {
    db.collection("predictions").doc(docId).set(
      { ...prediction, submittedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    ).catch((error) => {
      console.warn("Could not mirror prediction to Firestore.", error);
    });
  }
}
```

This alone should take the perceived save time from "2-3 seconds of nothing happening" to "instant" — the network writes still take the same wall-clock time, but the user isn't staring at unresponsive inputs waiting for them.

**The tradeoff to be aware of**: today's code treats the Supabase write as load-bearing — if it fails, the prediction is *not* saved anywhere and the function returns early without touching local state. Going optimistic means you need a retry/recovery path for the rare case the write actually fails, or a silently-wrong prediction sits in `localStorage` looking saved to the user but never reaching Supabase. A minimal version of `queueFailedPredictionRetry`:

```js
function queueFailedPredictionRetry(docId, row) {
  const pending = readLocalObject("ggo_wc_pending_writes");
  pending[docId] = row;
  writeLocalObject("ggo_wc_pending_writes", pending);
}

async function flushPendingPredictionWrites() {
  const pending = readLocalObject("ggo_wc_pending_writes");
  const ids = Object.keys(pending);
  if (!ids.length) return;
  for (const docId of ids) {
    try {
      await supabaseUpsert("predictions", [pending[docId]], "id");
      delete pending[docId];
    } catch (_) { /* still pending, try again next time */ }
  }
  writeLocalObject("ggo_wc_pending_writes", pending);
}
```

Call `flushPendingPredictionWrites()` on `requestSync()` (which already runs periodically) and you get automatic retry without the user ever noticing a failure happened, in the common case where it's a transient blip.

### Secondary cleanup (small wins, not the main fix)

- Cache `STATE.fixtures` lookups in a `Map` keyed by `matchId` instead of `Array.find()` scanning up to 104 entries on every save — trivial since fixtures rarely change shape after initial load.
- `handleScoreChange()` queries the DOM twice per keystroke via `querySelector` — fine at current scale (60 users, occasional input), not worth touching unless it becomes visibly janky.

---

## Part 2 — Email service

You need outbound email for: weekly recap emails (Part 4) and, longer-term, things like account-approval notifications. None of your current stack (Supabase, Cloudflare Worker, Firestore) sends email natively — Supabase Auth has email built in but you're not using Supabase Auth (you have a custom username+secretcode login), so that's not a shortcut here.

### Recommended: **Resend**, called from the Cloudflare Worker

Why Resend specifically, given your stack:
- Free tier (100 emails/day, 3,000/month) — comfortably covers 60 employees getting one weekly recap each (~240/month) plus the occasional chat-mention or comment notification if you add those later.
- Plain HTTP API — no SDK weirdness inside a Cloudflare Worker (your `workers/live-results.js` already does raw `fetch()` calls everywhere, this fits the existing style exactly).
- Sending domain verification is simple (a few DNS TXT/MX records) — you likely don't have a dedicated subdomain for this yet, so `noreply@gulfglobaloutsourcing.com` or a subdomain like `wc.gulfglobaloutsourcing.com` would need DNS access, which you may or may not have depending on who manages that domain.

**Alternative if DNS access is a blocker**: Resend also supports sending from their own shared domain on the free tier while you sort out custom domain verification — emails just show as coming from a Resend address until DNS is set up, fine for an internal tool.

### Wiring sketch

Add a new action to `workers/live-results.js`:

```js
async function sendEmail(env, { to, subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "GGO WC Predictor <noreply@yourdomain.com>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}
```

`RESEND_API_KEY` goes into the Worker's secrets the same way `SUPABASE_SERVICE_KEY`/`FIREBASE_SERVICE_ACCOUNT_JSON` already do (`wrangler secret put RESEND_API_KEY`).

**One thing you don't currently have anywhere**: an email address per user. The `users` table/Firestore collection only has `username`, `displayName`, `secretCode`, `isAdmin` — no `email` field. You'll need to either:
- Add an `email` column to `users` and backfill it for your ~60 employees (you already have a name list in `scripts/seedDatabase.js` — you'd just need to pair each with their email), or
- Collect it at account-request time — `submitAccountRequest()` in `app.js` already has a form (`request-display-name`, `request-username`, `request-note`) — add an `email` field there for any *new* signups going forward, and backfill existing users separately.

---

## Part 3 — Per-match chat

Reuses your existing 30s polling loop (`window.setInterval` in the `DOMContentLoaded` handler) — no websockets needed at this scale.

### Schema (Supabase)

```sql
create table if not exists match_comments (
  id bigint generated always as identity primary key,
  "matchId" text not null,
  username text not null,
  "displayName" text not null,
  body text not null check (char_length(body) <= 280),
  "createdAt" timestamptz default now()
);

create index if not exists idx_match_comments_matchid
on match_comments("matchId", "createdAt" desc);
```

280-char cap keeps it lightweight and discourages essay-length posts in what should be quick banter.

### Worker endpoints

Add to `workers/live-results.js`'s router:

```js
// GET /comments?matchId=123 — fetch comments for a match
if (path === "/comments" && request.method === "GET") {
  const matchId = url.searchParams.get("matchId") || "";
  if (!matchId) return corsJson({ error: "matchId required" }, 400);
  const rows = await supabaseSelect(env, "match_comments",
    `*&matchId=eq.${encodeURIComponent(matchId)}&order=createdAt.asc&limit=200`);
  return corsJson({ comments: rows });
}

// POST /comments — post a new comment (no admin auth needed, just a logged-in user)
if (path === "/comments" && request.method === "POST") {
  const body = await request.json();
  const { matchId, username, displayName, text } = body || {};
  if (!matchId || !username || !text?.trim()) {
    return corsJson({ error: "matchId, username, text required" }, 400);
  }
  const trimmed = text.trim().slice(0, 280);
  await supabaseUpsert(env, "match_comments", [{
    matchId: String(matchId), username, displayName: displayName || username,
    body: trimmed, createdAt: new Date().toISOString(),
  }]);
  return corsJson({ success: true });
}
```

(`supabaseUpsert` keys off a conflict column today — comments don't need upsert semantics since each post is new, so this can just be a plain insert; either add a no-conflict-key branch to `supabaseUpsert` or write a small `supabaseInsert` helper alongside it.)

### Frontend

Add a comment section inside the existing `openMatchDrawer()` panel — it's already the natural per-match focal point. Below the "Goalscorers" section, before "Your Prediction":

```js
<div class="drawer-section-label">Chat</div>
<div class="comment-list" id="drawer-comments"></div>
<form class="comment-form" onsubmit="postMatchComment(event, '${match.matchId}')">
  <input type="text" maxlength="280" placeholder="Say something..." required />
  <button type="submit">Send</button>
</form>
```

Fetch comments when the drawer opens, and re-poll on the existing 30s interval while the drawer is open (gate on `document.getElementById('match-drawer').classList.contains('open')` so you're not polling comments for a closed drawer).

**Moderation note**: 60 internal employees, low risk, but worth at minimum giving admins a delete button (`DELETE /comments?id=` , admin-token gated like `/sync-scores` already is) in case banter goes somewhere unprofessional.

---

## Part 4 — Weekly recap emails

Depends on Part 2 (email service) being wired up first.

### What goes in it

Cheap to compute from data you already have:
- **Top scorer this week** — diff `totalPoints` from 7 days ago vs now (needs a `leaderboard_history` snapshot table — see below — or just diff predictions scored in the last 7 days)
- **Biggest mover** — largest rank change week-over-week
- **Your own stats** — your points this week, your rank, your accuracy %
- **Upcoming matches you haven't predicted yet** — pulled straight from `STATE.fixtures` minus `STATE.predictions`, same logic the Predictions view already uses to show "Open" matches

### Minimal schema addition

```sql
create table if not exists leaderboard_snapshots (
  id bigint generated always as identity primary key,
  username text not null,
  "totalPoints" integer not null,
  rank integer not null,
  "snapshotAt" timestamptz default now()
);
```

A Cloudflare Worker cron (you already have `scheduled()` wired up in `workers/live-results.js` for score syncing) can write one row per user per week, then the recap job diffs the latest two snapshots per user.

### Cron wiring

Your `scheduled()` handler already branches on cron expression:

```js
async scheduled(event, env, ctx) {
  if (event.cron === "*/15 * * * *") {
    ctx.waitUntil(syncGroupStandings(env));
    return;
  }
  if (event.cron === "0 8 * * 1") { // Monday 8am UTC
    ctx.waitUntil(sendWeeklyRecaps(env));
    return;
  }
  ctx.waitUntil(syncLiveResults(env));
}
```

Add the new cron trigger to your `wrangler.toml`:

```toml
[triggers]
crons = ["*/5 * * * *", "*/15 * * * *", "0 8 * * 1"]
```

`sendWeeklyRecaps(env)` loads `users` (needs that `email` field from Part 2), loads current + last-week leaderboard snapshot, builds the HTML per user, calls `sendEmail()` per recipient. At 60 users this is trivially within rate limits for any provider.

---

## Part 5 — FotMob-style "suggested predictions"

FotMob/most prediction apps show a community consensus score next to the input ("Most predicted: 2-1") to nudge undecided users. This is the cheapest of the four features to build because **you already compute exactly this data** — the leaderboard build already aggregates every prediction per match, it just discards the per-match aggregate after scoring.

### Approach

Don't add new infrastructure — add a lightweight aggregate query. Two options:

**Option A — compute on-demand in the Worker** (simplest, no new tables):

```js
// GET /predicted-consensus?matchId=123
if (path === "/predicted-consensus") {
  const matchId = url.searchParams.get("matchId") || "";
  const predictions = await supabaseSelect(env, "predictions",
    `pred1,pred2&matchId=eq.${encodeURIComponent(matchId)}`);

  const tally = {};
  for (const p of predictions) {
    const key = `${p.pred1}-${p.pred2}`;
    tally[key] = (tally[key] || 0) + 1;
  }
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];

  return corsJson({
    matchId,
    totalPredictions: predictions.length,
    mostCommon: top ? { score: top[0], count: top[1] } : null,
    breakdown: sorted.slice(0, 5).map(([score, count]) => ({ score, count })),
  });
}
```

**Option B — fold into `/sync`** so every fixture already arrives with its consensus attached, avoiding an extra round-trip per match card. Given you already return all fixtures + results in one `/sync` payload, this is probably the better fit — compute the same tally inside `handleSyncGet()` once, grouped by `matchId`, and attach it to each fixture object before returning.

### Frontend display

In `renderPredictionCard()` in `scripts/app.js`, add a small consensus hint near the score inputs for matches the user hasn't predicted yet (don't show it for already-locked/finished matches — at that point it's not useful, and showing the "wisdom of the crowd" after the fact just feels like rubbing in a wrong guess):

```js
${!locked && !hasPred && match.consensus?.mostCommon
  ? `<div class="mc-consensus">Most predicted: <strong>${match.consensus.mostCommon.score}</strong> (${match.consensus.mostCommon.count} picks)</div>`
  : ""
}
```

**Cold-start caveat**: with no predictions yet for a freshly-opened match, `mostCommon` is `null` — handle that gracefully (just don't render the hint) rather than showing "0 picks."

**Should this influence predictions or just inform?** Worth deciding intentionally — showing the crowd's pick can anchor people toward groupthink rather than their own read on the match, which might be fine (more "fun office consensus" vibe) or might flatten the game's variance (everyone converges on the same picks, fewer outliers, less interesting leaderboard spread). No code change either way, just worth being aware of before shipping it.

---

## Suggested build order

1. **Save-latency fix (Part 1)** — zero new infra, pure UX win, do this first regardless of anything else.
2. **Email service wiring (Part 2)** — unblocks Part 4, needs the `email` field added to `users` + a Resend account + DNS (if using your own domain).
3. **Suggested predictions (Part 5)** — cheapest net-new feature, reuses existing data, no schema changes if you go with Option B folded into `/sync`.
4. **Per-match chat (Part 3)** — one new table, a couple endpoints, frontend slot already exists in the drawer.
5. **Weekly recap emails (Part 4)** — depends on #2, needs the new `leaderboard_snapshots` table + a cron job.
