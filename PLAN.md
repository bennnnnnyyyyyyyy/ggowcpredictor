# GGO Predictor Fix Plan

## Summary
Prioritize a canonical scoring repair, then rebuild leaderboard data from Supabase rows, then fix bracket prefill/seeding, remove Firestore paths, clean UI/CSS, and finally add low-risk feature upgrades.

Use the latest Claude chat as canonical where it conflicts with older docs: base scoring is `15 / 8 / 5 / 0`, with no legacy 3-point wrong-outcome consolation. Knockout multipliers default to: R32 `1.5x`, R16 `2x`, QF `2.5x`, SF/third `3x`, Final fixed `50 / 40 / 30 / 0`.

## Key Changes

- Scoring and recalculation:
  - Create one shared scoring policy used by `scripts/app.js`, `workers/live-results.js`, profile logic, and any Apps Script fallback still retasined.
  - Delete every legacy branch that awards `3` points for close wrong outcomes, including cutoff-based variants.
  - Recalculate from raw `predictions + results + fixtures`, not from hardcoded user deltas.
  - Update `pointsAwarded`, leaderboard `totalPoints`, `exactScores`, `correctOutcomes`, `scored/played`, `win_pct`, and rank from the recomputed rows.
  - Add an audit/dry-run script that reports affected predictions/users and verifies the expected Supabase audit shape: currently known target is `137` affected predictions, `411` points removed, `31` users.

- Bracket and knockout readiness:
  - Add Supabase migrations for `predictions.pred_winner`, `fixtures.penalty_winner`, richer `fixtures.stage`, and a `bracket_slots` table.
  - Store penalty winners as slot labels: `"team1"` or `"team2"`.
  - Build bracket from Supabase data, not frontend standings math.
  - Pre-fill bracket structure in advance with `TBD` slots, then resolve teams from `group_standings` and prior knockout winners.
  - Add a worker/admin endpoint to seed/update bracket slots once standings are available.

- Supabase-only migration:
  - Remove Firestore writes/mirroring from prediction save, account request, approval/rejection, worker sync, and leaderboard paths.
  - Remove Firestore fallback reads where Supabase is now canonical.
  - Keep `localStorage` only as offline/pending-write recovery, not as a competing shared datastore.
  - Update docs that still say Firestore is source of truth or required fallback.

- UI/CSS fixes:
  - Delete stale/competing mobile leaderboard CSS blocks, especially old `td::before { content: attr(data-label) }` behavior leaking into rank/player cells.
  - Tighten mobile leaderboard grid so rank, names, points, and percentages fit without overlap.
  - Keep flag-name normalization fixes for USA, Bosnia & Herzegovina, and DR Congo.
  - Update rules modal copy to remove the 3-point legacy rule and show the final scoring table.

- Documentation:
  - Update `docs/SCORING.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_BRIEF.md`, `docs/RESULTS_SETUP.md`, and `docs/WORKLOG.md`.
  - Mark Firestore-specific setup docs as legacy or remove them from active setup flow.
  - Record the recalculation method and user-facing explanation in plain language.

## Test Plan
- Run static checks: `node --check scripts/app.js`, `node --check workers/live-results.js`, and any profile/scoring JS touched.
- Run scoring unit cases for exact, close correct outcome, correct outcome only, wrong outcome, knockout penalty winner, and Final fixed scoring.
- Run recalculation dry-run against Supabase-export/local mirror first, then compare affected rows/users/points removed.
- Verify no row with correct W/D/L outcome receives `0` incorrectly, and no wrong-outcome row receives `3`.
- Verify leaderboard rank sorting still uses existing tie-breaks: total points, exact scores, correct outcomes.
- Test mobile leaderboard and bracket at phone and desktop widths.
- After deploy, trigger `/leaderboard` or the worker recalc endpoint and confirm Supabase `leaderboard` matches the dry-run output.

## Feature Ranking
- Easy: suggested predictions / consensus score from existing predictions.
- Easy-medium: optimistic prediction save with retry queue.
- Medium: per-match comments in the match drawer.
- Medium-hard: email field + approval/recap email service.
- Hard: weekly recap emails with leaderboard snapshots and scheduled digest logic.
- Hardest: fully automated official R32 pairing resolution if third-place qualifier mapping is not directly available from the data source.

## Assumptions
- Supabase is the only shared source of truth going forward.
- No local Supabase DB is required before planning, but implementation should either pull production schema locally or use Supabase migrations before mutating data.
- The latest Claude bracket/scoring spec supersedes older docs where they conflict.
- Existing user deltas are validation data only, never the source of truth for the repair.
