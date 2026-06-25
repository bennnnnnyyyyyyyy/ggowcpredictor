# Task Plan

## Goal
Add knockout-stage scoring multipliers and auto-fill the bracket/fixtures from standings as group stages finish, while keeping bracket rendering and scoring consistent across the app.

## Assumptions
- The user-provided knockout multipliers are authoritative for this tournament:
  - R32: 2x
  - R16: 2.5x
  - R8: 3x
  - R4 and third place: 4x
  - Final: 5x
- Group-stage standings remain the source of truth for qualifiers.
- Existing knockout fixture records can be populated or updated from standings/results without redesigning the whole data model.

## Phase 1: Recon the current bracket/scoring flow
- Identify where knockout rounds are rendered in the frontend.
- Identify where scoring is calculated in frontend and worker/backend paths.
- Confirm how standings are stored and how bracket teams are currently resolved.

## Phase 2: Define the knockout scoring model
- Add or update a shared round multiplier table.
- Make sure the same multiplier logic is used everywhere scoring is computed.
- Update docs so the written rules match the new knockout scoring behavior.

## Phase 3: Auto-fill bracket from standings
- Map group standings positions to knockout seeds.
- Resolve bracket slots automatically once standings are available.
- Keep unresolved slots visible as TBD until the source team is known.

## Phase 4: Wire bracket rendering to resolved fixtures
- Ensure bracket view reflects the auto-filled knockout fixtures.
- Keep later rounds visible and update them as dependencies resolve.
- Preserve readability on desktop and mobile.

## Phase 5: Validate and document
- Test scoring for each knockout round multiplier.
- Test automatic bracket population from standings changes.
- Update impacted markdown docs and add a short worklog note.

## Risks / Questions
- The docs currently describe different multiplier values than the ones you gave here; that needs a deliberate choice before implementation.
- It is not yet clear whether the app already has a single shared scoring source or still has duplicate scoring logic in multiple files.
- The exact seeding/pairing pattern for the knockout bracket needs to match the tournament format already encoded in the fixture data.

## Done Criteria
- Knockout matches score with the new round multipliers.
- Bracket and fixtures autofill from current standings.
- Resolved and unresolved knockout slots render correctly.
- Docs reflect the implemented rules.
