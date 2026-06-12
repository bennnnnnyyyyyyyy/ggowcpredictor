# GGO WC 2026 Predictor — Architecture

> Last updated: 2026-06-11

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Static Site)                    │
│                                                                 │
│  index.html  ──loads──►  scripts/app.js                        │
│                              │                                  │
│  Firebase SDK (CDN)  ◄───────┤                                  │
│  (compat v11.0.2)            │                                  │
│                              ▼                                  │
│            ┌─────────────────────────────────┐                  │
│            │           STATE object           │                  │
│            │  fixtures / results / predictions│                  │
│            │  leaderboard / users / teams     │                  │
│            └──────────────┬──────────────────┘                  │
│                           │                                     │
│         ┌─────────────────┼──────────────────┐                  │
│         ▼                 ▼                  ▼                  │
│  Firestore SDK    Apps Script API      Local JSON               │
│  (primary)        (secondary)          (fallback)               │
└─────────────────────────────────────────────────────────────────┘
          │                 │
          ▼                 ▼
   Google Firestore   Apps Script Web App
   (ggowcpredictor)   (deployed via clasp)
          │                 │
          │           ┌─────┘
          │           │
          ▼           ▼
   ┌──────────────────────────┐
   │   Firestore Collections  │
   │                          │
   │  users/          ◄──── Apps Script reads predictions
   │  fixtures/       ◄──── Seeded from worldcup.json
   │  predictions/    ◄──── Browser writes on submit
   │  results/        ◄──── Apps Script writes from API-Football
   │  leaderboard/    ◄──── Apps Script calculates daily
   └──────────────────────────┘
```

---

## Data Load Priority (Browser)

Each data type has a 3-tier fallback:

| Data | Tier 1 | Tier 2 | Tier 3 |
|------|--------|--------|--------|
| All game data | `?action=sync` (Apps Script) | — | — |
| Fixtures | `?action=fixtures` (Apps Script) | Firestore `fixtures/` | `2026/worldcup.json` |
| Results | `?action=sync` (Apps Script) | Firestore `results/` | localStorage |
| Predictions | — | Firestore `predictions/` | localStorage |
| Leaderboard | `?action=leaderboard` (Apps Script) | Firestore `leaderboard/current` | buildLocalLeaderboard() |
| Teams/flags | — | Firestore `teams/` | `2026/worldcup.teams.json` |

---

## Firestore Collections (Canonical Schema)

### `users/{username}`
```json
{
  "displayName": "Ben Arthur",
  "secretCode": "GGO2026",
  "isAdmin": true,
  "totalPoints": 0,
  "joinedAt": "timestamp"
}
```

### `fixtures/{matchId}`
> matchId is a **string** of the sequential integer (e.g. `"1"`, `"72"`)
```json
{
  "matchId": "1",
  "round": "Matchday 1",
  "group": "Group A",
  "stage": "group",
  "date": "2026-06-11",
  "time": "13:00 UTC-6",
  "kickoffUTC": "2026-06-11T19:00:00Z",
  "team1": "Mexico",
  "team2": "South Africa",
  "ground": "Mexico City",
  "apiFixtureId": null
}
```
> ⚠️ `apiFixtureId` MUST be populated after the API-Football ID is known. This is the bridge between fixtures and live results.

### `predictions/{username}_{matchId}`
```json
{
  "username": "ben_arthur",
  "matchId": "1",
  "pred1": 2,
  "pred2": 1,
  "submittedAt": "timestamp",
  "pointsAwarded": null,
  "scoredAt": null
}
```

### `results/{matchId}`
> matchId must match fixture matchId (NOT the API fixture ID)
```json
{
  "matchId": "1",
  "score1": 2,
  "score2": 0,
  "status": "FT",
  "lastUpdated": "timestamp"
}
```

### `leaderboard/current`
```json
{
  "players": [
    {
      "rank": 1,
      "username": "ben_arthur",
      "displayName": "Ben Arthur",
      "totalPoints": 247,
      "exactScores": 4,
      "correctOutcomes": 18,
      "predicted": 72
    }
  ],
  "updatedAt": "timestamp"
}
```

---

## Apps Script Backend (`src/`)

| File | Purpose | Status |
|------|---------|--------|
| `Code.js` | Entry point (minimal) | ✅ Ready |
| `main.js` | `doGet` / `doPost` router + sync logic | ⚠️ Has `firebaseConfig` reference bug |
| `fixtures.js` | Seed fixtures from Drive + live score fetch | ⚠️ Drive path wrong; matchId bridge missing |
| `leaderboard.js` | Leaderboard calculation and Firestore snapshot write | ✅ Ready |
| `firebase.js` | Firestore REST helpers | ✅ Solid utility layer |
| `firebaseConfig.js` | Firebase project config | ✅ Config exists |

---

## Apps Script Scheduled Triggers

| Function | Schedule | Purpose |
|----------|----------|---------|
| `scheduledLiveScoresUpdate` | Every 60 minutes during tournament | Fetch API-Football scores → write `results/` |
| `scheduledLeaderboardUpdate` | Daily | Recalculate all player points → write `leaderboard/current` |

---

## Key External Services

| Service | Usage | Auth |
|---------|-------|------|
| Firebase Firestore | Primary data store | SDK apiKey (client-safe) |
| API-Football (api-sports.io) | Live scores | `API_FOOTBALL_KEY` in Script Properties (never in browser) |
| Google Drive | Fixture seed JSON source | Apps Script DriveApp |
| Google Fonts | Typography (Barlow Condensed, DM Sans) | CDN |

---

## Deployment

| Artifact | Deploy Method |
|----------|---------------|
| `index.html` + `style.css` + `scripts/` | Host statically (any web server, Firebase Hosting, or file://) |
| `src/` | `clasp push` → Apps Script project `1Lx-q30o3CFcM7_h6OiuoiPNgRzaZE2SK_WnKkPFoBplS8W4ckWWa0B_0` |

Apps Script deployment ID: `AKfycbwk6Xx2K9Y043hGFKCkMcIYfphV3mL3-qkNkR7yIyDEabPUqzNvseHmVwxCmmY6QN6L`
