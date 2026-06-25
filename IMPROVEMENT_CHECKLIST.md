# Improvement Checklist

## Quick Wins

- [ ] Stop duplicate network fetches in the client sync flow.
- [ ] Reduce initial page load weight by trimming unnecessary requests and renders.
- [ ] Confirm the app does not fetch the same data more than once during startup.
- [ ] Make sure cron jobs are updating standings on schedule.
- [ ] Verify the leaderboard refresh path runs after score updates and standings updates.
- [ ] Keep rank numbers visible and readable on small screens.
- [ ] Reduce overly large card spacing in prediction views.
- [ ] Use sharp flag images on retina screens.
- [ ] Keep layout and image aspect ratios stable so flags do not appear stretched or flipped.
- [ ] Update any doc that still mentions stale scoring or data-source behavior.
- [ ] Keep setup notes, scoring notes, and troubleshooting notes synchronized.

## Easy-Medium

- [ ] Remove any leftover legacy 3-point wrong-outcome logic.
- [ ] Automate leaderboard refresh so it does not require a manual API call.
- [ ] Keep polling intervals reasonable for the amount of live data that actually changes.
- [ ] Make long player names fit without excessive truncation.
- [ ] Keep team flag code mapping in sync with fixture team names.
- [ ] Verify Bosnia and Herzegovina, USA, and DR Congo flag mappings still resolve correctly.
- [ ] Track which source is responsible for each match update.
- [ ] Prefer stable sources for critical results and standings.
- [ ] Verify any new API before depending on it in production.
- [ ] Record major fixes in a short changelog or worklog entry.

## Medium

- [ ] Verify every scoring path uses the same canonical rules.
- [ ] Confirm exact scores outrank non-exact rows in tie cases.
- [ ] Check the profile view and main leaderboard for matching totals after refresh.
- [ ] Avoid recomputing the leaderboard on every read if a cached table already exists.
- [ ] Add caching for worker responses that are repeatedly requested.
- [ ] Confirm only one live results writer is active.
- [ ] Verify the worker uses the service-role key for writes that RLS would block.
- [ ] Confirm manual overrides exist for scores or results when the API fails to update.
- [ ] Add a sync audit script for Supabase vs any legacy store.

## Medium-Hard

- [ ] Avoid full-list re-renders when only one prediction changes.
- [ ] Keep leaderboard rows compact on phones.
- [ ] Prevent the leaderboard from sliding horizontally on mobile.
- [ ] Confirm group standings refresh when the upstream source changes.
- [ ] Auto-fill the bracket from standings once the qualifying positions are known.
- [ ] Confirm bracket seeding runs from standings data instead of requiring manual placement.
- [ ] Verify knockout and group-stage logic are handled separately where needed.
- [ ] Make sure fixture stage values are available for future bracket work.
- [ ] Ensure manual score fixes update the database row, not just the UI.
- [ ] Add a per-match consensus hint if it helps users make predictions.

## Hard

- [ ] Add per-match chat only if moderation and performance stay simple.
- [ ] Add recap emails only after email delivery and user email storage are solid.
- [ ] Add bracket automation only after standings and knockout data are stable.
- [ ] Keep a clear fallback chain for live match data sources.
- [ ] Keep request volume within the daily limit for every provider.
- [ ] Keep markdown docs aligned with runtime behavior.
