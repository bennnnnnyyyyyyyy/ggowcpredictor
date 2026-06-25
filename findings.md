# Findings

- Existing docs already cover knockout-bracket behavior, but they currently describe an older multiplier scheme than the one requested.
- The repository already has a bracket rendering path in `scripts/app.js` and worker-side live/standings sync logic in `workers/live-results.js`.
- `docs/BRACKET_IMPLEMENTATION_PLAN.md` is the best high-level blueprint for the bracket autofill work.
- `docs/SCORING.md` is the current canonical scoring doc, but its round multipliers do not match the requested knockout schedule.
- `claudechats/KNOCKOUT_BRACKET_AND_SCORING.md` contains a more detailed design for bracket seeding and scoring consolidation, including several implementation cautions.
