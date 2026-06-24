# GGO WC 2026 - Standings

This document covers the official group standings surface in the app.

## Source of Truth

- Standings are hydrated from `STATE.groupStandings`.
- The browser does not calculate group tables locally.
- The Worker sync writes `group_standings` rows from the official data source.

## UI

- A dedicated `Standings` button appears in the top navigation.
- The button opens a standalone standings view powered by the same `renderGroupStandings()` renderer used elsewhere in the app.
- The view shows the official tables only; it does not mix in prediction-derived math.
- The view also renders a third-place qualifier table below the group tables.

## Behavior

- If standings have not synced yet, the view shows a loading/empty state.
- Once synced, each group renders as a table ordered by official position.
- The third-place table is sorted from the official third-place rows across all groups by points, goal difference, goals for, and team name, with the top 8 highlighted as qualifiers.
- The standings view is intended to stay lightweight and read-only.

## Related Files

- [index.html](../index.html)
- [scripts/app.js](../scripts/app.js)
- [scripts/game.js](../scripts/game.js)
- [workers/live-results.js](../workers/live-results.js)
- [docs/PROJECT_BRIEF.md](PROJECT_BRIEF.md)
