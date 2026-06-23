# GGO WC 2026 — Canonical Scoring Rules

> **Status: LOCKED** — This is the single source of truth. Active scoring code in `workers/live-results.js`, `scripts/app.js`, and profile rendering must use these exact values. The defunct Apps Script `src/` backup is not an active scoring source.

---

## How the game works

Players predict the score of **every match** — group stage + all knockout rounds. Knockout bracket slots unlock as real results come in, but players can pre-fill them. This is the same model as the beIN Sports predictor.

There are **two scoring contexts**:

| Context | Description |
|---|---|
| **Main Game** | All 104 matches. Full point values (see below). |
| **Mini Tourney** (bonus) | A secondary competition that starts when the group stage ends. Uses **¼ of the main point values**, rounded down. Only knockout stage predictions count. |

---

## Main Game Scoring Table

| Result | Points |
|--------|--------|
| **Exact score** (e.g. predicted 2-1, actual 2-1) | **15** |
| **Correct outcome + goal difference within 1** (e.g. predicted 2-0, actual 3-0) | **8** |
| **Correct outcome only** (right W/D/L, but GD off by 2+) | **5** |
| **Wrong outcome** | **0** |
| **No match** | **0** |

### How "correct outcome + GD within 1" works

`Math.abs((pred1 - pred2) - (actual1 - actual2)) <= 1`

Example: You predict 2-0 (GD=+2), actual is 3-1 (GD=+2) → GD gap = 0 → **8 pts**
Example: You predict 2-0 (GD=+2), actual is 4-1 (GD=+3) → GD gap = 1 → **8 pts**
Example: You predict 2-0 (GD=+2), actual is 4-0 (GD=+4) → GD gap = 2 → **5 pts**

## Mini Tourney Scoring (¼ values)

Starts when group stage ends (after **2026-06-27**). Only **Round of 32 onwards** count.

| Result | Points |
|--------|--------|
| Exact score | **3** |
| Correct outcome + GD within 1 | **2** |
| Correct outcome only | **1** |
| Wrong outcome | **0** |
| No match | **0** |

---

## Round Multipliers

To make late-stage games more valuable, apply a multiplier on top of base points:

| Stage | Multiplier |
|-------|-----------|
| Group Stage (Matchday 1–17) | ×1 |
| Round of 32 | ×1 |
| Round of 16 | ×2 |
| Quarter-final | ×3 |
| Semi-final | ×4 |
| Final / 3rd Place | ×5 |

> **Example**: Exact score in the Final = 15 × 5 = **75 points**

---

## Implementation Notes

- The canonical backend scoring function should be the single source for persisted leaderboard totals.
- `workers/live-results.js:scoreMatch` persists the official leaderboard totals.
- `scripts/app.js:calculateMatchPoints` mirrors the current 15/8/5/0 display rule for client-side fallbacks.
- Ignore defunct Apps Script scoring files in `src/` unless that backup surface is deliberately revived.
- Multipliers should be derived from the fixture's `stage` field (`group`, `r32`, `r16`, `qf`, `sf`, `final`/`third`).

---

## Locking Rules

- Predictions lock **15 minutes before kickoff** (UTC).
- Locking is enforced on the frontend (UI disables inputs).
- **Production must also enforce this in Firestore Security Rules** — client-side lock is not sufficient.
