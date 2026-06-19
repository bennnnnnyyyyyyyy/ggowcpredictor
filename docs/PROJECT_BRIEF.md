# GGO WC 2026 Predictor - Project Brief

Last updated: 2026-06-19

## Goal

Build an internal FIFA World Cup 2026 prediction game for Gulf Global Outsourcing employees.

Employees log in with a username and secret code, predict individual match scores, see official group tables synced from Supabase, and compete on a shared leaderboard. Real results and official group standings should be synced automatically from trusted football data sources; an admin should not manually enter match results.

## Current Architecture

- `index.html` is the static app shell.
- `style.css` is the visual system.
- `scripts/app.js` is the browser app logic currently loaded by `index.html`.
- `src/` is Google Apps Script backend code deployed by clasp.
- `2026/worldcup.json` and related files are local fixture seed data from openfootball.
- Supabase is the primary datastore for users, fixtures, predictions, results, leaderboard, and official group standings.
- Cloudflare Worker is the trusted backend for score syncing, group standings syncing, and leaderboard maintenance.
- Firestore remains a backup/fallback data source for older flows.

Important naming note: `src/main.js` is not the browser entrypoint. It is Google Apps Script backend code.

## Intended Runtime Flow

1. Employee opens the static site.
2. Browser initializes Firebase.
3. Employee logs in with a Firestore `users/{username}` document and `secretCode`.
4. Browser reads `fixtures`, current user's `predictions`, `results`, `group_standings`, and `leaderboard`.
5. Employee submits score predictions into `predictions/{username}_{matchId}`.
6. Predictions must lock 15 minutes before kickoff. This must be enforced in backend rules or trusted server logic before production.
7. Cloudflare Worker periodically fetches real scores from `worldcup26.ir` and writes `results`.
8. Cloudflare Worker periodically fetches official group tables from `worldcup26.ir/get/groups` and writes `group_standings`.
9. Cloudflare Worker recalculates `leaderboard`.
10. The browser exposes a dedicated `Standings` tab backed by the official `group_standings` data.

## Canonical Data Model

### users/{username}

- `displayName`: string
- `secretCode`: string
- `isAdmin`: boolean
- `totalPoints`: number
- `joinedAt`: timestamp

### fixtures/{matchId}

- `matchId`: string or number, but use one type consistently
- `round`: string
- `group`: string
- `date`: string
- `time`: string
- `kickoffUTC`: timestamp or ISO string
- `team1`: string
- `team2`: string
- `ground`: string
- `stage`: string
- `apiFixtureId`: number or string, once mapped to the live score provider

### predictions/{username}_{matchId}

- `username`: string
- `matchId`: same type as fixtures
- `pred1`: number
- `pred2`: number
- `submittedAt`: timestamp
- `pointsAwarded`: number or null
- `scoredAt`: timestamp or null

### results/{matchId}

- `matchId`: same type as fixtures
- `score1`: number or null
- `score2`: number or null
- `status`: string
- `lastUpdated`: timestamp

### leaderboard/current

- `players`: array of player summary objects
- `updatedAt`: ISO timestamp for the last leaderboard refresh

### group_standings

- `group_name`: group letter/name
- `team_id`: source API team ID
- `team_name`: display name
- `position`: official position, 1-4
- `played`, `won`, `drawn`, `lost`: official record
- `goals_for`, `goals_against`, `goal_difference`: official goals, with `goal_difference` calculated as `goals_for - goals_against`
- `points`: official points
- `updated_at`: sync timestamp

## Scoring

The current scoring rule set is:

- exact score: 15
- correct outcome + goal difference within 1: 8
- correct outcome only: 5
- wrong outcome: 0

The 3-point close-call rule was cancelled and should not be referenced in active docs or runtime behavior.

## Known State On 2026-06-10

- Firebase config exists in `scripts/app.js`, `scripts/firebaseConfig.js`, and `src/firebaseConfig.js`.
- Firestore database is reported as created in `me-central1`.
- Login reads Firestore directly and falls back to mock users if Firebase fails.
- Fixture rendering exists but still has rough edges.
- Group standings in `scripts/app.js` render Supabase `group_standings` rows and do not calculate ranks on the frontend.
- Result rendering, bracket rendering, filtering, score sync, and real leaderboard calculation are not complete.
- Apps Script deployment ID in context: `AKfycbwk6Xx2K9Y043hGFKCkMcIYfphV3mL3-qkNkR7yIyDEabPUqzNvseHmVwxCmmY6QN6L`.
- Apps Script project ID in `.clasp.json`: `1Lx-q30o3CFcM7_h6OiuoiPNgRzaZE2SK_WnKkPFoBplS8W4ckWWa0B_0`.

## External Services Needed

- Firebase Firestore project: `ggowcpredictor`.
- API-Football key from API-Sports, stored only in Apps Script or another trusted backend.
- Google Apps Script/clasp deployment for scheduled score sync.

## Environment Constraints

The user stated this PC has no cmd, no admin, and nothing added to PATH. Prefer PowerShell built-ins and existing local files. Do not assume global CLIs are installed.
