# GGO WC 2026 Predictor — Setup Guide

---

## Prerequisites

- A Google account with access to the GGO Firebase project (`ggowcpredictor`)
- Access to the Apps Script project (Google Account that owns it)
- Access to the Supabase project `ggowcpredictor`
- Optionally: `clasp` installed (only needed to push backend changes)

> ⚠️ This PC has no admin/PATH access. All commands below use PowerShell built-ins or browser-based tools only.

---

## Step 1 — Verify Firebase Project

1. Open [Firebase Console](https://console.firebase.google.com) → project `ggowcpredictor`
2. Confirm Firestore database exists in region `me-central1`
3. Confirm these collections exist (create if missing):
   - `users`
   - `fixtures`
   - `predictions`
   - `results`
   - `leaderboard`
   - `teams`

---

## Step 2 — Add Players (users collection)

For each player, create a document in `users/{username}` with these fields:

| Field         | Type      | Example          |
| ------------- | --------- | ---------------- |
| `displayName` | string    | `"Ben Arthur"`   |
| `secretCode`  | string    | `"GGO2026"`      |
| `isAdmin`     | boolean   | `true` / `false` |
| `totalPoints` | number    | `0`              |
| `joinedAt`    | timestamp | (now)            |

You can do this directly in the Firebase Console UI, or use the Firestore REST API.

---

## Step 3 - Configure Cloudflare Worker Secrets

1. Open the Cloudflare Worker for `ggowcpredictor`.
2. Add the Supabase and Firestore secrets listed in [CLOUDFLARE_WORKER_SETUP.md](CLOUDFLARE_WORKER_SETUP.md).
3. Keep provider API keys in Worker secrets only; never put them in `index.html`, `scripts/app.js`, or any frontend file.

---

## Step 4 - Seed Fixtures

Use the active Worker/local scripts to seed or repair fixtures. The defunct Apps Script `src/` backup should not be used for new fixture seeding work unless it is deliberately revived.

Recommended active paths:

```powershell
npm run live-sync
node scripts/repair-matchids.js --dry-run
```

---

## Step 5 - Confirm Worker Cron Triggers

Cloudflare Worker cron triggers are the active schedules:

- `*/5 * * * *` for live score sync and leaderboard recalculation.
- `*/15 * * * *` for official group standings sync.

Do not enable old Apps Script score or leaderboard triggers; they are defunct and can create duplicate writes.

---

## Step 6 - Configure Supabase

1. Open Supabase project `ggowcpredictor`.
2. Run the SQL in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to the Cloudflare Worker secrets for trusted writes.
4. Keep the browser publishable key limited to client reads/writes allowed by policy.

Supabase is the primary datastore; Firestore remains a fallback/mirror for older flows.

---

## Step 7 — Configure the Browser App

1. Open `index.html` in a browser (serve via local web server, not `file://` — fetch requires HTTP).
2. Log in with an admin account.
3. Click the settings gear → enter the **Game Data API URL**:
   ```
   https://ggowcpredictor.ben-arthur-wiz.workers.dev
   ```
4. Click **Save & Reconnect** → it should sync and show fixtures.

---

## Step 8 — Serve Locally (for testing)

Since this PC has no global CLI, use PowerShell's built-in HTTP listener or Python (if installed):

```powershell
# Check if Python is available
python --version

# If yes, serve from the project folder:
python -m http.server 8080 --directory "C:\Users\abdel\OneDrive\Desktop\ggofiles\ggowcpredictor"

# Then open: http://localhost:8080
```

---

## Step 9 — Deploy for Team

Options (no CLI required):

- **Firebase Hosting**: Upload `index.html`, `style.css`, `scripts/`, `2026/`, and image assets via the Firebase Console file browser.
- **GitHub Pages**: Push repo to GitHub → enable Pages on the root or `ggowcpredictor/` folder.
- **SharePoint / OneDrive share link**: Share `index.html` (note: `fetch` may fail on some SharePoint origins — prefer a real web server).

---

## Firestore Security Rules (Before Going Live)

Add these rules to prevent clients from writing results or manipulating other players' predictions:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Anyone authenticated can read
    match /fixtures/{doc} { allow read; allow write: if false; }
    match /results/{doc}  { allow read; allow write: if false; }
    match /leaderboard/{doc} { allow read; allow write: if false; }
    match /teams/{doc}    { allow read; allow write: if false; }
    match /users/{username} { allow read; allow write: if false; }

    // Predictions: users can write only their own, read all
    match /predictions/{predId} {
      allow read;
      allow write: if predId.matches(request.auth.uid + '_.*');
    }
  }
}
```

> ⚠️ Currently the app uses username/secretCode auth, NOT Firebase Auth. Until Firebase Auth is wired up, keep rules permissive in dev. Lock them down before sharing with the team.
