# Leaderboard Stabilization Plan

## Summary

The legacy wrong-result 3-point scoring has already been removed from the runtime scoring paths. The current issue is no longer the scoring formula itself. It is stale cached leaderboard data and inconsistent source order between views.

Canonical scoring is now `15 / 8 / 5 / 0`:
- exact score = `15`
- correct outcome + goal-difference gap `<= 1` = `8`
- correct outcome only = `5`
- wrong outcome = `0`

Leaderboard tie-break rule:
- exact scores must outrank non-exact rows when totals are close
- do not let stale rank or points metadata leave a non-exact player ahead of an exact-score player

## Current State

- `workers/live-results.js` no longer contains the old pre-cutoff 3-point branch.
- `scripts/app.js` and `scripts/profile.js` now use the same no-legacy scorer.
- The profile page was changed to read Supabase first so it matches the main app data path.
- The main leaderboard loader was also switched to prefer Supabase first.
- The raw prediction/result data is correct for Ray Parker and other users.
- The denormalized `leaderboard` table still contains stale metadata for some users, especially `predicted` and `scored` counts.

## What Must Happen Next

- Rebuild the `leaderboard` table from canonical `predictions` and `results`.
- Verify the rebuilt rows match the recalculated totals for users with stale counts.
- Ensure the leaderboard rank is recomputed against the full table, not per-user.
- Use exact scores as the decisive tie-breaker when two players have the same points.
- Confirm the profile view and the main leaderboard now agree after refresh.

## Known Mismatch Pattern

- `totalPoints` is often already correct.
- `predicted` can be overstated in the stored leaderboard row.
- `scored` can also be stale.
- `exactScores` and `correctOutcomes` should be verified during the rebuild.

## Validation

- Re-run the audit query against current data:
  - leaderboard points should match recalculated points
  - leaderboard metadata should match recalculated metadata
- Check Ray Parker after rebuild:
  - `totalPoints` should remain `180`
  - `predicted` should match the raw prediction count
  - `scored` should match the number of finished joined results
- Confirm the main tab and profile page show the same totals after a hard refresh.

## Follow-Up Work

- If any future scoring changes are made, update every scorer path together:
  - `workers/live-results.js`
  - `scripts/app.js`
  - `scripts/profile.js`
  - `src/leaderboard.js`
- Keep docs aligned with the runtime behavior after any leaderboard or scoring change.
- Defer larger bracket/knockout changes until the leaderboard cache is fully stable.

## Assumptions

- Supabase raw tables are the source of truth.
- `leaderboard` is a cached/derived table and can be regenerated safely.
- PowerShell is the preferred shell on this machine.
