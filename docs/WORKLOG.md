# Work Log

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
