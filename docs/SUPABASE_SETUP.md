# Supabase Backup Setup

Supabase is the backup datastore for Firebase quota outages. The Apps Script backend still tries Firestore first, then falls back to Supabase if Firestore returns a quota/error response.

## Project

- URL: `https://nthnysznieivbkncpqrk.supabase.co`
- Apps Script reads `SUPABASE_URL` and `SUPABASE_KEY` from Script Properties first.
- If those properties are missing, it falls back to `firebaseConfig.supabaseUrl` and `firebaseConfig.supabaseAnonKey`.

## Tables

Run this in the Supabase SQL Editor:

```sql
create table if not exists users (
  username text primary key,
  "displayName" text,
  "secretCode" text,
  "isAdmin" boolean default false,
  "totalPoints" int default 0,
  "joinedAt" timestamptz
);

create table if not exists fixtures (
  "matchId" text primary key,
  round text,
  "group" text,
  stage text,
  date text,
  time text,
  "kickoffUTC" timestamptz,
  team1 text,
  team2 text,
  ground text,
  "apiFixtureId" int
);

create table if not exists predictions (
  id text primary key,
  username text,
  "matchId" text,
  pred1 int,
  pred2 int,
  "submittedAt" timestamptz,
  "pointsAwarded" int,
  "scoredAt" timestamptz
);

create table if not exists results (
  "matchId" text primary key,
  score1 int,
  score2 int,
  status text,
  "lastUpdated" timestamptz
);

create table if not exists leaderboard (
  username text primary key,
  rank int,
  "displayName" text,
  "totalPoints" int default 0,
  "exactScores" int default 0,
  "correctOutcomes" int default 0,
  predicted int default 0,
  scored int default 0,
  "updatedAt" timestamptz
);
```

## Migration

After Firebase quota resets, run `migrateFirestoreToSupabase()` in Apps Script. It copies:

- `users`
- `fixtures`
- `predictions`
- `results`

You can also trigger it through `doPost` with:

```json
{ "action": "migrateToSupabase" }
```

## Leaderboard Fallback

`calculateAndUpdateLeaderboard()` now:

1. Reads Firestore collections with pagination.
2. Falls back to matching Supabase tables if Firestore is blocked.
3. Calculates the leaderboard once from the normalized rows.
4. Writes the leaderboard to Google Sheets.
5. Tries to write `leaderboard/current` in Firestore.
6. Upserts player rows into the Supabase `leaderboard` table.

The public API endpoints `?action=sync` and `?action=leaderboard` use the same calculation path, so the scheduled job and frontend API no longer disagree.
