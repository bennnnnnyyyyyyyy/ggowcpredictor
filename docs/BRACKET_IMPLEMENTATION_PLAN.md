# Bracket Implementation Plan

Goal: make the knockout bracket behave like a live schedule page, where the visible bracket updates automatically as `group_standings` changes, and prepare scoring so knockout rounds can use round-based multipliers.

This plan assumes:
- `group_standings` is the source of truth for qualifiers.
- The frontend never calculates group rankings.
- Knockout fixtures are rendered from a fixed bracket template and filled in from the current standings snapshot.

---

## 1. Desired Behavior

The bracket should work like a live knockout schedule:
- show all knockout rounds in a stable structure
- show `TBD` until a slot is resolvable
- update participant names automatically when group standings change
- keep already-known matchups visible while downstream slots remain dependent on previous results
- keep the bracket readable on desktop and mobile without collapsing into a long list of unrelated cards

The key rule is simple:
- group standings determine qualifiers
- qualifiers determine the bracket
- bracket results determine later bracket slots
- no client-side standings math

---

## 2. Scope

### In scope
- bracket rendering for knockout rounds
- bracket slot resolution from `group_standings`
- automatic updates when standings rows change
- bracket display for scheduled, live, and completed knockout matches
- round multiplier support for scoring
- backend scoring parity with frontend display
- validation for missing qualifiers and incomplete rounds

### Out of scope
- changing how group standings are calculated
- adding new tournament data sources
- rewriting the leaderboard engine unrelated to knockout scoring
- styling unrelated pages

---

## 3. Data Model

### 3.1 Qualifier source

Use `group_standings` rows only:
- `group_name`
- `team_name`
- `position`
- `points`
- `goal_difference`
- `goals_for`
- `goals_against`

Bracket qualifier resolution should be derived from:
- `1A`, `2A`
- `1B`, `2B`
- `1C`, `2C`
- etc.

### 3.2 Knockout slot model

Each bracket slot should know:
- round name
- match label
- source team A
- source team B
- source type for each side:
  - group qualifier
  - winner of prior match
  - loser of prior match, if bronze match
- display status:
  - `TBD`
  - `scheduled`
  - `live`
  - `complete`

### 3.3 Round multipliers

Round multipliers should be stored as part of the knockout scoring policy:
- `1.5x` for `R32`
- `2x` for `R16`
- `2.5x` for `R8`
- `2.5x` for `R4`
- `2.5x` for bronze
- `3x` for final

Open decision:
- define whether multiplier applies to the raw awarded points and then rounds to an integer, or whether the app keeps decimal points internally and only rounds for display.

Recommended default:
- keep the multiplier as a numeric field
- apply it in the shared scorer
- round only once at the end of scoring

---

## 4. Bracket Resolution Rules

### 4.1 Group qualifiers

Create one resolver function that maps:
- `1A` -> group `A`, position `1`
- `2A` -> group `A`, position `2`
- `1B` -> group `B`, position `1`
- `2B` -> group `B`, position `2`

The resolver should:
- read from `STATE.groupStandings`
- return `TBD` if the standing is missing
- never infer a qualifier by re-sorting data locally

### 4.2 Knockout dependency chain

Bracket slots should resolve in this order:
1. group-stage qualifiers
2. round of 32 or round of 16 entries
3. quarterfinal entries
4. semifinal entries
5. bronze and final

If one upstream slot changes, all downstream slots should refresh automatically.

### 4.3 BBC-style behavior

Match the useful parts of the BBC schedule layout:
- one knockout section
- a fixed round structure
- teams appear in slots as they become known
- later rounds stay visible even when unresolved
- completed matches should still show the path that led there

The goal is behavioral similarity, not visual cloning.

---

## 5. Implementation Phases

### Phase 1: bracket data layer

Add a bracket model that can express:
- round
- match id
- source slot A
- source slot B
- winner/loser dependency
- multiplier
- display label

Deliverable:
- a pure function that turns standings + known knockout results into a bracket state object

Acceptance:
- bracket state can be generated without touching the DOM
- missing qualifiers do not crash generation

### Phase 2: bracket resolver

Add a resolver for:
- group winners
- runners-up
- later-round winners
- bronze match participants

Deliverable:
- helper functions that resolve slot references like `1A`, `W1`, `L2`

Acceptance:
- current standings can produce the correct initial bracket
- changing a group position updates the bracket automatically

### Phase 3: bracket rendering

Refactor the bracket UI so it only renders from bracket state.

Deliverable:
- a bracket renderer that accepts structured state and outputs the schedule view

Acceptance:
- UI does not calculate standings or qualifiers
- unresolved teams display as `TBD`
- completed matches remain visible

### Phase 4: multiplier support

Introduce round multipliers into the scoring path.

Deliverable:
- one shared multiplier table
- one shared scoring function used by frontend display and backend totals

Acceptance:
- a knockout match can show its round multiplier
- leaderboard scoring matches the same policy everywhere

### Phase 5: validation and logging

Add warnings for:
- missing group rows
- duplicate positions
- missing qualifiers
- malformed bracket references
- unsupported round labels

Deliverable:
- clear console warnings during sync and render

Acceptance:
- bad data degrades gracefully
- no silent bracket corruption

---

## 6. Files Likely To Change

Frontend:
- `scripts/app.js`
- `scripts/game.js` if any bracket helpers still live there

Worker:
- `workers/live-results.js`

Docs:
- `docs/ARCHITECTURE.md`
- `docs/WORKLOG.md`
- `docs/SUPABASE_SETUP.md` if the bracket reads new tables later

Potential future data files:
- a dedicated bracket schedule JSON if the knockout path becomes static

---

## 7. Scoring Integration

The scoring layer should treat the multiplier as a round attribute, not a UI label.

Recommended rule:
- base prediction points are calculated first
- round multiplier is applied second
- final score is normalized once

The multiplier table should live in one shared place so:
- frontend previews show the same value as backend totals
- leaderboard updates stay consistent
- future bracket rounds can be added without changing the scoring shape

Important:
- do not duplicate round multiplier logic in multiple files
- do not hardcode bracket scoring inside the renderer

---

## 8. Validation Checklist

Before calling the bracket done:
- sync `group_standings`
- confirm `1A`, `2A`, `1B`, `2B` resolve correctly
- confirm bracket updates when positions change
- confirm `TBD` appears for unresolved slots
- confirm knockout round multipliers display correctly
- confirm scoring uses the same multiplier table in all paths
- confirm mobile layout still fits the bracket without overlap

---

## 9. Open Decisions

These need to be settled before implementation is finalized:
- whether multiplier-applied points should be stored as decimals or rounded integers
- exact round naming for the tournament schedule labels
- whether bronze is treated as a third-place match or part of the semifinal round group in scoring
- whether bracket results should be sourced from the Worker, Supabase, or both

---

## 10. Success Criteria

The work is complete when:
- the bracket updates automatically from `group_standings`
- no standings math remains in the frontend
- knockout rounds resolve from current standings and prior results
- multipliers are available for knockout scoring
- the display stays stable while the data changes
- the implementation is documented and traceable
