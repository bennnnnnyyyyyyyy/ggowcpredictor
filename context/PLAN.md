# GGO Predictor Fix Plan

## Summary
Prioritize a canonical scoring repair, then rebuild leaderboard data from Supabase rows, fix bracket prefill/seeding, remove Firestore paths, clean UI/CSS, and add admin tooling.

Base scoring: `15 / 8 / 5 / 0`. Knockout multipliers: R32 `2x`, R16 `2.5x`, QF `3x`, SF/third `4x`, Final `5x`.

---

## Completed

### Scoring
- ✅ Case-insensitive `penalty_winner` comparisons in both `live-results.js` (backend) and `app.js` (client).
- ✅ `resolveSlot()` uses `.toLowerCase()` for penalty winner, so bracket advances correctly from penalty shootouts.
- ✅ `normalizeWorldcup26Games` now maps `home_penalty_score`/`away_penalty_score` → `homePenalty`/`awayPenalty`.
- ✅ `derivePenaltyWinner(item, flipped)` helper auto-computes `penalty_winner` from API penalty score data.
- ✅ `syncLiveResults` uses `derivePenaltyWinner` so future shootouts auto-resolve without SQL patches.

### Bracket UI
- ✅ Desktop: `.vertical-bracket` capped at `max-width: 60%` via `@media (min-width: 1000px)`.
- ✅ Mobile: `.vertical-bracket .bracket-score` font-size raised to `16px` (was `12px`).

### Admin Panel
- ✅ `index.html` admin section replaced — no longer "coming soon"; now has five functional sections.
- ✅ Backend endpoint `POST /admin/set-penalty-winner` (worker).
- ✅ Backend endpoint `POST /admin/set-score` (worker) — manual score override.
- ✅ Frontend: `renderPenaltyWinnerAudit()` renders unresolved knockout draws with one-click fix buttons.
- ✅ Frontend: `adminOverrideScore()` — submits score correction to `/admin/set-score`.
- ✅ Frontend: `adminTriggerRecalc()` — hits `/sync-scores` to force a leaderboard rebuild.
- ✅ Frontend: `adminLookupUser()` — shows a user's full predictions vs results table.
- ✅ `renderAdmin()` now updates static HTML sections (stats bar, account requests, penalty audit) without clobbering the whole panel.

### Database Fixes (Manual SQL)
- ✅ `results` rows for matchId `75` (Germany vs Paraguay) and `76` (Netherlands vs Morocco) manually set to `penalty_winner = 'team2'`.

---

## In Progress / Next

### Admin Panel — Remaining Features
- [ ] Audit log — table of who changed what (matchId, field, old value, new value, timestamp).
- [ ] Data integrity check — surface matches with duplicate predictions, mismatched stages, or `status = FT` with no score.
- [ ] Lock/unlock match override — bypass `isLocked()` for early lock or emergency unlock.

### Scoring
- [ ] Verify no legacy 3-point branch remains in `profile.js` scoring fallback.
- [ ] Run a dry-run recalc script and confirm affected predictions/users match expected output.

### Bracket
- [ ] Verify third-place team slot resolution for 3A/B/C/D/F patterns.
- [ ] Confirm bracket auto-advances on next `renderBracket()` call after penalty_winner DB patch.

### Supabase Migration
- [ ] Remove remaining Firestore read/write calls from `app.js` and worker.
- [ ] Mark Firestore setup docs as legacy.

---

## Feature Backlog (Prioritized)
- Easy: consensus/popular pick hint on prediction cards.
- Easy-medium: optimistic prediction save with retry queue.
- Medium: per-match comments in the match drawer.
- Medium-hard: email field + approval email on account request.
- Hard: weekly recap emails with leaderboard snapshot.
- Hardest: fully automated R32/R16 third-place bracket pairing from live standings.

---

## Assumptions
- Supabase is the only shared source of truth.
- `penalty_winner` is stored as `"team1"` or `"team2"` (lowercase). All comparisons must use `.toLowerCase()` defensively.
- API `id` field ≠ internal `matchId` for some knockout games — always join through `apiFixtureId`, not by assuming equality.
