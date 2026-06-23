# Live Results Setup

This project now separates responsibilities:

- Cloudflare Workers handles live scores, official standings, and leaderboard refreshes.
- Supabase is the primary datastore for the app UI.
- Firestore remains a fallback/mirror for older flows.
- The Apps Script `src/` backup is defunct except for email-specific helpers.

## What Must Exist

### 1. Supabase tables and Firestore fallback collections

These Supabase tables must exist, with matching Firestore fallback collections where legacy flows still need them:

- `fixtures`
- `results`
- `predictions`
- `users`
- `teams`

For live results to work, the important one is `results`.

Each result document should look like this:

```json
{
  "matchId": "1",
  "score1": 2,
  "score2": 1,
  "status": "FT",
  "lastUpdated": "2026-06-12T00:00:00.000Z"
}
```

The document ID should be:

- `match_1`
- `match_2`
- and so on

### 2. Fixtures must already be seeded

The worker matches live scores to Supabase fixtures first, then Firestore fallback fixtures.

Your fixture documents need:

- `matchId`
- `team1`
- `team2`
- `date`
- `time`
- `kickoffUTC`
- `round`
- `group`
- `stage`

If fixtures are missing, the worker has nothing to map live scores against.

### 3. A live score source

The worker supports:

- Primary: `worldcup26.ir` open-source API
- Backup 1: Zafronix
- Backup 2: `live-score-api.com`

Primary source endpoint:

- `https://worldcup26.ir/get/games`

Primary source does not require a secret for read access.

Backup 1 source secret:

- `ZAFRONIX_API_KEY`

Backup 2 source secrets:

- `LIVESCORE_API_KEY`
- `LIVESCORE_API_SECRET`

### 4. Worker database write access

The Cloudflare Worker needs Supabase service-role access for canonical writes and Firestore service account access for fallback/mirror writes.

Required secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON` for fallback/mirror writes

Optional secret:

- `FIREBASE_PROJECT_ID`
- `SEED_TOKEN` for manual `/seed` and `/sync` requests

Default project:

- `ggowcpredictor`

## What To Disable

To avoid wasted quota and duplicate writes:

- Do not enable old Apps Script score, standings, or leaderboard triggers.
- Keep the defunct Apps Script `src/` backup out of the active sync path.
- Use the Worker cron triggers as the only live writers.

## Cloudflare Worker Setup

In Cloudflare dashboard:

1. Open the Worker for `ggowcpredictor`.
2. Go to `Variables and secrets`.
3. Add these secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `ZAFRONIX_API_KEY`
   - `LIVESCORE_API_KEY`
   - `LIVESCORE_API_SECRET`
   - `SEED_TOKEN`
4. Go to `Trigger events`.
5. Enable the cron schedule.

To seed once manually, call the Worker with:

```bash
curl -H "Authorization: Bearer YOUR_SEED_TOKEN" https://YOUR-WORKER_URL/seed
```

The current schedule is:

- every 5 minutes

## Worker Files In This Repo

- [workers/live-results.js](../workers/live-results.js)
- [wrangler.jsonc](../wrangler.jsonc)

## How The Sync Works

1. Worker loads Supabase `fixtures` (Firestore fallback).
2. Worker fetches live match data from `worldcup26.ir` (Zafronix / Livescore as fallbacks).
3. For each API game, the worker resolves the internal fixture:
   - **Primary:** `worldcup26.ir game.id` → `fixtures.apiFixtureId` → `fixtures.matchId`
   - **Fallback:** normalized team names (`team1` / `team2`)
4. Scores are saved to `results.matchId` using the **internal** sequential id (`"1"`…`"104"`), never the API game id.
5. During sync, missing `apiFixtureId` values are backfilled on matched fixtures.
6. Only started/finished games with both scores are upserted into `results`.
7. Leaderboard is recalculated from `predictions` joined to `results` on `matchId`.

### MatchId mapping contract

```
worldcup26.ir game.id  →  fixtures.apiFixtureId  →  fixtures.matchId  →  results.matchId  →  predictions.matchId
```

If this chain breaks, users keep `predicted` counts but `scored` stays low.

### Repair after a mapping gap

```bash
# Dry run
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/repair-matchids.js --dry-run

# Apply backfill + missing results
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/repair-matchids.js

# Recalculate standings
curl -H "Authorization: Bearer YOUR_SEED_TOKEN" https://YOUR-WORKER_URL/sync-scores
```

## Why Results Might Still Not Show

If the Results tab is blank or leaderboard `scored` is too low, check these in order:

1. `results` collection/table is empty or missing finished matches.
2. `results.matchId` does not match `fixtures.matchId` / `predictions.matchId` (run `scripts/repair-matchids.js`).
3. `fixtures.apiFixtureId` is null and team-name matching failed (e.g. DR Congo alias).
4. The worker secrets are missing in Cloudflare.
5. The worker is deployed but the cron trigger is off.
6. `/sync-scores` `updated` count is low because games are still `NS` or scores are null in the API.

## Quick Verification In Firebase Console

Open Firestore and check:

- `fixtures/match_1`
- `results/match_1`

The `matchId` values should match.

If `fixtures/match_1` exists but `results/match_1` does not, the worker has not written the result yet.

## Quick Verification In The App

Open the browser console and inspect:

```js
Object.keys(STATE.results)
STATE.results["1"]
```

If `STATE.results["1"]` is empty or missing `score1` and `score2`, the sync did not write the live result correctly.

## Recommended Final State

- Cloudflare Worker is the only live results, standings, and leaderboard writer.
- Supabase stores canonical shared data.
- Firestore remains fallback/mirror only.
- The browser app reads the Worker `/sync` payload first, then falls back to direct Supabase/Firestore reads.