# GGO WC 2026 Predictor

Internal FIFA World Cup 2026 prediction game for Gulf Global Outsourcing employees.

## Quick Start

Open [docs/project-tracker.html](docs/project-tracker.html) in a browser for the full project dashboard (features, bugs, scoring, architecture).

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) | Goal, architecture overview, known state |
| [docs/SCORING.md](docs/SCORING.md) | **Canonical scoring system** — 15/8/5/3/0 + multipliers + mini tourney |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram, Firestore schema, backend status |
| [docs/SETUP.md](docs/SETUP.md) | Admin setup: Firebase, seeding, API key, triggers |
| [docs/WORKLOG.md](docs/WORKLOG.md) | Chronological work log |
| [docs/ERROR_REDUCTION.md](docs/ERROR_REDUCTION.md) | Rules to follow before editing code |
| [docs/project-tracker.html](docs/project-tracker.html) | Interactive visualizer — open directly in browser |

## Current Status (Jun 11, 2026)

- **Audit score**: 10/20 (Acceptable — significant work needed)
- **P0 open**: `savePrediction` crashes when match is locked
- **P1 open**: `firebaseConfig` reference error in Apps Script, matchId mismatch, leaderboard stub, seed Drive path wrong, scoring conflict (now resolved in SCORING.md)
- **Working**: Login, fixture loading, country flags, prediction inputs (UI), group standings, 15-min lock
