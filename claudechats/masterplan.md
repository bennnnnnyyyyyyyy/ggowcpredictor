# Leaderboard Stabilization Master Checklist

## Goal

- [ ] Make the leaderboard and profile views agree on the same canonical scoring and totals.
- [ ] Remove any remaining stale cached leaderboard metadata.
- [ ] Verify exact scores win tie-breaks when totals are otherwise close.

## Canonical Rules

- [ ] Keep scoring fixed at `15 / 8 / 5 / 0`.
- [ ] Preserve `15` for exact score predictions.
- [ ] Preserve `8` for correct outcome with goal-difference gap `<= 1`.
- [ ] Preserve `5` for correct outcome only.
- [ ] Preserve `0` for wrong outcome.
- [ ] Ensure exact scores outrank non-exact rows when totals are close.
- [ ] Prevent stale rank or points metadata from placing a non-exact player ahead of an exact-score player.

## Current State To Preserve

- [ ] Confirm `workers/live-results.js` stays free of the old pre-cutoff 3-point branch.
- [ ] Confirm `scripts/app.js` and `scripts/profile.js` use the same no-legacy scorer.
- [ ] Keep the profile page reading Supabase first so it matches the main app data path.
- [ ] Keep the main leaderboard loader preferring Supabase first.
- [ ] Preserve the correct raw prediction/result data for Ray Parker and other users.

## Data Repair Work

- [ ] Rebuild the `leaderboard` table from canonical `predictions` and `results`.
- [ ] Verify rebuilt rows match recalculated totals for users with stale counts.
- [ ] Recompute leaderboard rank against the full table, not per-user.
- [ ] Use exact scores as the decisive tie-breaker when two players have the same points.
- [ ] Confirm the profile view and the main leaderboard agree after refresh.

## Stale Metadata Checks

- [ ] Check whether `totalPoints` is already correct in existing leaderboard rows.
- [ ] Check whether `predicted` is overstated in stored leaderboard rows.
- [ ] Check whether `scored` is stale in stored leaderboard rows.
- [ ] Verify `exactScores` during the rebuild.
- [ ] Verify `correctOutcomes` during the rebuild.

## Validation

- [ ] Re-run the audit query against current data.
- [ ] Confirm leaderboard points match recalculated points.
- [ ] Confirm leaderboard metadata matches recalculated metadata.
- [ ] Check Ray Parker after rebuild.
- [ ] Confirm `totalPoints` remains `180` for Ray Parker.
- [ ] Confirm `predicted` matches the raw prediction count.
- [ ] Confirm `scored` matches the number of finished joined results.
- [ ] Confirm the main tab and profile page show the same totals after a hard refresh.

## Follow-Up Guardrails

- [ ] Update every scorer path together if any future scoring changes are made.
- [ ] Keep `workers/live-results.js` aligned with `scripts/app.js`.
- [ ] Keep `scripts/profile.js` aligned with `src/leaderboard.js`.
- [ ] Keep docs aligned with runtime behavior after any leaderboard or scoring change.
- [ ] Defer larger bracket or knockout changes until the leaderboard cache is fully stable.

## Assumptions

- [ ] Treat Supabase raw tables as the source of truth.
- [ ] Treat `leaderboard` as a cached or derived table that can be regenerated safely.
- [ ] Use PowerShell as the preferred shell on this machine.
