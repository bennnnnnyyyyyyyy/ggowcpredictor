# Scoring Bug: Points Awarded for Wrong Outcomes

## Bug

The scoring logic awarded points to predictions where the picked outcome
(W/D/L) did not match the actual match outcome. This inflated `points` and
likely `won` (and therefore `win_pct`) for every user who had at least one
mis-scored prediction.

## Your job

1. **Find the scoring function** (likely something like `calculateScore`,
   `scorePrediction`, or similar — search for where points-per-prediction are
   computed and written to the predictions/results table).
2. **Confirm the actual bug**: check whether it's awarding points when
   `predicted_outcome !== actual_outcome` (e.g. an `||` that should be `&&`,
   a missing outcome check before the exact-score check, or scoring exact
   score correctly but outcome check is skipped/wrong).
3. **Do not hardcode any per-user point deltas.** Do not use the numbers below
   to patch totals directly. They are provided only so you can verify your
   fix produces the same deltas — not as the source of truth.

## Fix approach

1. Pull every prediction row with its `predicted_outcome` (or derive from
   predicted score), `actual_outcome` (or derive from actual score), and
   `points_awarded`.
2. Recompute `points_awarded` per prediction using the **correct** rule:
   prediction scores 0 points whenever `predicted_outcome != actual_outcome`,
   regardless of any partial/exact-score bonus.
3. Diff old vs. new `points_awarded` per row. Where they differ, that row was
   mis-scored — log it (user, match, old points, new points).
4. Recompute aggregate `points` (sum of corrected `points_awarded`) per user.
5. **Check whether `won` (or equivalent "correct picks" counter) is derived
   from the same per-prediction correctness flag used for scoring, or from a
   separate independent check.**
   - If same flag: `won` needs the identical recomputation — recount how many
     predictions per user have `predicted_outcome == actual_outcome` under
     the corrected logic, don't just subtract a derived delta.
   - If independent: leave `won` alone, it was never wrong.
   - **Verify by example before trusting either path**: pick the user with
     username `selene` (8 pts in the old data, 1 `won` out of 64 `played`).
     If the corrected `won` count for this user would go negative or doesn't
     match her actual prediction log, your assumption about how `won` is
     derived is wrong — go read the code path, don't infer it from deltas.
6. Recompute `played` only if it currently includes invalid/void
   matches — otherwise it's untouched (it's just a count of predictions
   made, not correctness-dependent).
7. Recompute `win_pct` as `won / played` using the corrected `won`.
8. Re-run leaderboard ranking by the corrected `points` (and tie-break by
   whatever the existing tiebreak rule is — check `ORDER BY` in the
   leaderboard query).

## Validation data (for your own sanity check only — not for patching)

These are the point deltas a manual audit found between old and new totals,
keyed by username. After your fix runs, the corrected `points` for each of
these users should drop by exactly this amount relative to current
production values, and the deltas should all be **divisible by the
per-wrong-pick point value** your scoring function uses for a correct
outcome guess (this came out to multiples of 3 in the manual audit, implying
3 points per wrong-outcome prediction were being awarded — confirm this
against the actual scoring constant in code, don't assume it).

```
frank.clarkson: -27   william.white: -27   hope.smith: -24
mike.woods: -24       jason.foster: -24    bruce.logan: -21
alex.woods: -21       laura.miller: -18    thomas.smith: -18
jimmy: -18            chris.johnson: -18   ray.parker: -15
norman.clarke: -15    jane: -12            ben_arthur: -12
rickk.nelson: -12     caroline.richards: -12  oscar.kamel: -12
joseph.brown: -12     cobe.jones: -9       peter.smith: -9
marcy.miller: -9      ian.strange: -9      nora.atkins: -6
andrew.cooper: -6     ben.camel: -6        john.williams: -6
selene: -6            roben.neves: -6      eva.christian: -3
russ.dami: -3
```

Two usernames from the audit list (`jasmine.green`-equivalent and
`grant.holden`-equivalent display names) had no deduction and aren't in this
list — they should be unaffected. Confirm by username, not display name,
since display names in the leaderboard UI don't necessarily match
`username` 1:1 (e.g. one user displays as "Rick Nelson" but their username
contains a typo'd double-k).

## After the fix, also check

- Whether the buggy scoring function already ran via a cron/recompute job
  after this fix lands, so totals don't get re-corrupted on the next
  scheduled run.
- Whether any cached/denormalized leaderboard table needs a manual
  recompute trigger, or if it derives live from predictions on every read.
