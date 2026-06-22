# Implementation Plan - Leaderboard and Tie-Breaker Stabilization

Resolve the leaderboard issue where Ray Parker is incorrectly ranked first due to truncated prediction data, and stabilize the ranking tie-breaker logic.

## User Review Required

> [!IMPORTANT]
>
> - **Cause of Ray Parker's rank issue:** The Supabase REST API caps results at 1000 rows by default. With 1046 predictions in the database, the backend worker was missing Ray's newer predictions, leaving him with a stale score of 172 (and rank 3) in the database.
> - **Cause of the tie-breaker issue:** The backend worker grouped ranks using `totalPoints` only, ignoring `exactScores` and `correctOutcomes`. This led to users with the same points but different exact scores getting the same rank, causing unstable order in the frontend table.
> - **Resolution:**
>   1. We will update `supabaseSelect` in the backend worker to paginate using the `Range` header (1000 rows per page) to load all predictions.
>   2. We will update the worker's ranking logic to only group users into the same rank if they are tied across *all* criteria (points, exact scores, and correct outcomes).
>   3. We will update the frontend sorting in `scripts/app.js` to ensure the table rendering is deterministic and matches the backend rankings.
>   4. We will run a script or trigger the `/sync-scores` endpoint to force-rebuild the database leaderboard.

## Proposed Changes

---

### Cloudflare Worker Backend

#### [MODIFY] [live-results.js](file:///c:/Users/ben.arthur/Desktop/ggowcpredictor/workers/live-results.js)

- Modify `supabaseSelect(env, table, query)` to support automatic page-by-page fetching using the `Range: start-end` header.
- Modify `buildLeaderboard(resultRows, predictionRows, userRows, fixtureRows)` to group ranks by `totalPoints`, `exactScores`, and `correctOutcomes`.

---

### Browser App Frontend

#### [MODIFY] [app.js](file:///c:/Users/ben.arthur/Desktop/ggowcpredictor/scripts/app.js)

- Update `loadLeaderboard()` to sort `STATE.leaderboard` deterministically (rank, points, exact scores, outcomes, username) so that UI ordering is perfectly stable.

---

## Verification Plan

### Automated/Manual Verification

1. Deploy the updated worker backend code (or test it locally by running the endpoint/scripts).
2. Trigger the leaderboard recalculation via the worker's API or a command script.
3. Verify that the Supabase `leaderboard` table now contains the correct values for Ray Parker:
   - `totalPoints`: 180
   - `exactScores`: 3
   - `correctOutcomes`: 24
   - `predicted`: 42
4. Verify that the leaderboard is sorted and ranked correctly, with `william.white` (188 pts, 4 exact) at Rank 1, `norman.clarke` (186 pts, 4 exact) at Rank 2, and `ray.parker` (180 pts, 3 exact) at Rank 3.
