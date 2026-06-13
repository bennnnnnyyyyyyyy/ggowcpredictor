# Work Log

## 2026-06-13 - Supabase fallback and leaderboard repair

### What changed

- Replaced the misnamed `src/supabaseConfig,js` file with `src/supabase.js` so clasp can deploy the Supabase helper layer.
- Added paginated Firestore collection reads for leaderboard data, removing the old 500-document ceiling.
- Added Supabase fallback reads for `users`, `fixtures`, `predictions`, and `results` when Firestore is blocked.
- Added `migrateFirestoreToSupabase()` plus `doPost` action `migrateToSupabase` for copying Firestore data after quota reset.
- Updated `src/main.js` so `?action=sync` and `?action=leaderboard` use the same leaderboard calculation path as the scheduled job.
- Leaderboard writes now try Firestore and also upsert rows into the Supabase `leaderboard` table.
- Added [SUPABASE_SETUP.md](SUPABASE_SETUP.md) with table SQL and the migration runbook.

### Verification

- Ran `node --check src/main.js`.
- Ran `node --check src/leaderboard.js`.
- Ran `node --check src/supabase.js`.
- Confirmed only one `scheduledLeaderboardUpdate` and one `calculateLeaderboard` definition remain in `src/`.

### Notes

- Existing Firebase quota limits can still block the initial migration until the daily reset.
- Supabase tables must be created before fallback reads or leaderboard upserts will succeed.

## 2026-06-10 - Repo orientation and docs setup

### What I learned

- The app is meant to be a GGO-branded FIFA World Cup 2026 employee score predictor.
- Current browser entrypoint is `index.html` plus `scripts/app.js`.
- Current backend folder is `src/`, intended for Google Apps Script/clasp deployment.
- Firebase is already configured in multiple places for project `ggowcpredictor`.
- Firestore is intended as shared state for users, fixtures, predictions, results, and leaderboard.
- Apps Script is intended to seed/sync data and call external score APIs without exposing API keys to the frontend.

### Files inspected

- `context/copilotchathistory.md`
- `context/chathistoryclaude.md`
- `context/context.md`
- `README.md`
- `package.json`
- `index.html`
- `style.css`
- `scripts/app.js`
- `scripts/firebaseConfig.js`
- `src/main.js`
- `src/firebase.js`
- `src/fixtures.js`
- `src/leaderboard.js`
- `src/Code.js`
- `src/firebaseConfig.js`
- `2026/worldcup.json`
- `2026/worldcup.groups.json`
- `BACKEND_SETUP.md`
- `FIREBASE_SETUP.md`
- `INTEGRATION_CHECKLIST.md`

### Current blockers / decisions needed

- Confirm the final scoring system. Current docs and code disagree.
- Confirm whether login should remain direct Firestore username/code or move behind Apps Script.
- Confirm API-Football key availability and where it will be stored in Apps Script properties.
- Decide whether to seed fixtures from local `2026/worldcup.json` via a local Node script or via Apps Script/Drive.
- Replace hardcoded group teams in `scripts/app.js` with data from Firestore or `2026/worldcup.groups.json`.

### Changes made

- Added `docs/PROJECT_BRIEF.md`.
- Added `docs/ERROR_REDUCTION.md`.
- Added this work log.

### Verification

- Ran `git status --short`.
- Read back all new docs with `Get-Content -Raw`.
- Reviewed README diff to confirm it points to the new docs.
- No app runtime tests were run because this change only adds documentation.

## 2026-06-13 - Mobile layout pass

### What changed

- Tightened the app shell for phones and small tablets.
- Converted leaderboard and group standings into stacked card layouts on narrow screens.
- Reworked header navigation, filters, and sync controls to scroll and wrap more gracefully on touch devices.
- Stacked match and result cards more aggressively on small screens so content no longer relies on desktop-width columns.
- Added `.impeccable.md` with project design context for future UI work.

### Verification

- No browser run was captured in this session.
- Reviewed the responsive CSS and table renderers after the edits to confirm the new mobile data labels and stacked layouts are in place.

## 2026-06-13 - Post-merge login recovery

### What changed

- Repaired a merge-broken syntax error in `scripts/app.js` that prevented the browser script from loading and blocked login.
- Removed an unreachable duplicate return in `isLocked(match)` while preserving the 1-minute pre-kickoff lock rule.
- Kept `hasResult(result)` aligned with the current app behavior by requiring numeric scores plus a live/final status.

### Verification

- Ran `node --check scripts/app.js` successfully.
- Searched `scripts/app.js` for leftover merge markers and found none.

## 2026-06-11 - Full audit, canonical docs, and project visualizer

### What changed

- Ran a deep technical audit across all source files (`app.js`, `style.css`, `src/main.js`, `src/leaderboard.js`, `src/fixtures.js`, `src/firebase.js`).
- Identified 1 P0 bug, 6 P1 bugs, 6 P2 issues, 2 P3 polish items.
- Created `docs/SCORING.md` — canonical scoring system (15/8/5/3/0 + round multipliers + mini tourney ¼-point variant).
- Created `docs/ARCHITECTURE.md` — full system diagram, Firestore schema, backend file status.
- Created `docs/SETUP.md` — step-by-step admin setup guide.
- Created `docs/project-tracker.html` — self-contained interactive project dashboard (open in browser).
- Locked the scoring system: 15 exact / 8 correct+GD≤1 / 5 correct outcome / 3 close wrong / 0 miss × round multipliers.
- Confirmed game flow: players predict ALL 104 matches (group + knockout); predicted bracket auto-advances. Mini tourney activates post-group-stage with ¼ points.

### Key decisions logged

- Scoring: app.js variant (15/8/5/3/0) confirmed as canonical, plus stage multipliers (×1/1/2/3/4/5).
- Mini tourney: separate leaderboard, knockout only, activates after 2026-06-27.
- matchId: must be a consistent string throughout all layers.

### Verification

- All new docs read back after creation.
- project-tracker.html is self-contained and requires no server to open.

### Blockers still open

- `savePrediction` P0 crash (locked branch references undefined vars)
- `main.js` ReferenceError (`FIREBASE_CONFIG` vs `firebaseConfig`) is fixed by the shared collection loader path
- `leaderboard.js` now fetches users, predictions, and results from Firestore and writes `leaderboard/current`
- matchId mismatch between fixtures (sequential int) and API-Football results (API fixture ID)
- `seedFixturesFromJSON` reads from wrong Drive location

---

## 2026-06-10 - Flags, lock timing, and game data API

### What changed

- Added country flags sourced from `2026/worldcup.teams.json`.
- Rendered flags in prediction cards, results, standings, and bracket views.
- Kept prediction inputs disabled when the match is inside the 15-minute lock window.
- Added a 30-second UI refresh so lock state updates without a hard reload.
- Switched the browser app to prefer the configured Game Data API URL for `?action=sync`, `?action=fixtures`, and `?action=leaderboard`, with local/Firestore fallback.
- Renamed the settings label from `Apps Script / Firebase URL` to `Game Data API URL`.

### Verification

- Ran `node --check scripts/app.js`.
- Started a temporary static server from `C:\tmp` to verify the app loads over HTTP.
- Confirmed `http://127.0.0.1:4173/` returned `200`.
- Confirmed `http://127.0.0.1:4173/2026/worldcup.teams.json` returned `200`.

### Notes

- The app still falls back to Firestore/local JSON if the configured API URL is empty or unreachable.
- No browser screenshot was captured in this run because the browser automation tool was not available in this session.
