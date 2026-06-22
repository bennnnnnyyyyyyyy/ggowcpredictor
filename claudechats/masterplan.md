# Leaderboard Reversal First, Then Stabilization

## Summary

Priority 1 is to remove the legacy wrong-result 3-point scoring from all leaderboard calculations. The canonical rule becomes `15 / 8 / 5 / 0`: exact score, correct result with close goal difference, correct result, wrong result.

Default assumption: rebuild totals/ranks from corrected scoring and refresh the leaderboard table. Do not hardcode per-user deductions, and do not manually patch totals.

## Key Changes

- Fix remaining legacy scorer in `src/leaderboard.js` by deleting the `totalGap <= 2 ? 3 : 0` branch.
- Confirm all active scorers match the same rule:
  - `workers/live-results.js`
  - `scripts/app.js`
  - `scripts/profile.js`
  - `src/leaderboard.js`
- Recalculate leaderboard from `predictions + results + fixtures + users`, then persist refreshed leaderboard rows.
- Remove stale rules copy in `index.html` that says pre-Jun-18 close wrong-result predictions may still show 3 points.
- Update impacted docs after code edits, especially scoring/user-facing behavior notes.

## Validation

- Add or run targeted scoring checks:
  - exact score returns `15`
  - correct outcome with GD gap `<= 1` returns `8`
  - correct outcome with GD gap `> 1` returns `5`
  - wrong outcome, even close scoreline, returns `0`
- Re-run the audit query/report against current data:
  - expected historical target remains about `137` affected predictions
  - expected removed points remains about `411`
  - expected correct outcomes receiving `3` points remains `0`
- Hit the Worker `/leaderboard` or `/sync-scores` path after changes and verify ranks/totals are rebuilt from corrected scoring.
- Check profile match cards and leaderboard table do not show stale 3-point wrong-result totals.

## Next Work After Reversal

- Fix stale profile/leaderboard fallback behavior so profile totals never trust an outdated leaderboard row when recalculated prediction history is available.
- Apply save-latency work from `LATENCY_AND_FEATURES.md`: optimistic local update, background Supabase/Firestore writes, retry queue, and less full-page rerendering.
- Clean mobile leaderboard layout issues from `claudechats/1.md` and `claudechats/2.md`: rank label leakage, cramped names, table sliding, and flag alias coverage.
- Defer larger knockout/bracket work until scoring is stable:
  - shared stage-aware scorer
  - `pred_winner` / `penalty_winner`
  - bracket slots/promotions
  - rules modal rewrite for knockout multipliers

## Assumptions

- The live Worker scorer is already mostly correct; the main reversal risk is inconsistent older scoring code paths and stale persisted leaderboard data.
- The leaderboard table is denormalized/cache-like and can be safely regenerated from canonical `predictions` and `results`.
- Stored `predictions.pointsAwarded` will not be rewritten in the first pass unless a later decision requires historical row cleanup too.
- All commands should be PowerShell-compatible because this PC has no `cmd`, no admin, and nothing extra added to `PATH`.
