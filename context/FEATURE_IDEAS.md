# Feature Ideas and Implementation Notes

This document collects product ideas that would help non-football fans make better predictions and make the game feel more approachable.

The focus is not just "what to add", but "what data, logic, and UI changes are needed to make it real".

---

## 1. Goals

The app should help users who do not follow football closely by:

- showing quick context for each team
- surfacing sensible prediction suggestions
- explaining why one outcome looks more likely than another
- keeping the interface simple enough that users can still make fast picks

The main product rule is:

- do not force users to understand the full tournament to participate well

---

## 2. High-Value Features

### 2.1 Country profiles

#### What it is

A country profile is a compact summary shown for each team. It gives users enough context to judge strength without opening another tab or reading a long report.

#### What to show

Suggested fields:

- country name
- flag
- confederation
- FIFA/world ranking or internal strength tier
- recent form summary
- goals scored/conceded in the tournament
- best result so far
- short "style" label such as `defensive`, `balanced`, or `attack-minded`
- key player notes if available

#### Why it helps

- non-fans get a quick baseline for team strength
- users can compare teams faster
- suggestions become more trustworthy when backed by context

#### Implementation approach

1. Create a `country_profiles` dataset keyed by team name or team ID.
2. Store only stable or semi-stable fields in the source data:
   - team name
   - flag asset
   - confederation
   - ranking/tier
   - description
3. Derive dynamic fields at runtime from current data:
   - current group position
   - goals for/against
   - points
   - form streak
4. Render the profile in a small side panel, modal, or expandable card on match pages.

#### Data source options

- static JSON for tournament-wide metadata
- Supabase table if the profiles need admin editing
- worker-backed payload if the profiles should be synced centrally

#### Recommended first version

Start with static profiles plus live tournament stats. That gives useful context without needing a new admin UI.

---

### 2.2 Top 3 predictions per game

#### What it is

For each match, show the three most likely prediction options so users can make a quick decision even if they do not know the teams.

This can mean one of two things:

- top 3 scorelines
- or top 3 outcome buckets such as home win, draw, away win

For most users, the scoreline version is more helpful if the UI keeps it readable.

#### Why it helps

- reduces decision friction
- gives casual users a sane default
- creates a "best guess" path for people who do not want to analyze every match

#### Implementation approach

1. Build a prediction suggestion engine for each fixture.
2. Score candidate outcomes using team strength and match context.
3. Return the top 3 ranked predictions with confidence values.
4. Show them directly in the match card or inside a helper drawer.

#### Suggested ranking inputs

Use a simple weighted model first:

- team strength tier or ranking
- current group form
- goals scored and conceded
- historical win/draw tendency
- knockout vs group-stage context
- neutral venue effect if relevant

Optional later inputs:

- bookmaker-style probabilities if a trusted source is available
- user crowd-sourced prediction trends
- injury or suspension notes

#### Suggested output format

Example:

- `Argentina 2-0` - 31%
- `Argentina 2-1` - 22%
- `1-1 Draw` - 15%

For a casual mode, the output can also include:

- `home win`
- `draw`
- `away win`

#### Recommended first version

Start with a deterministic heuristic, not machine learning.

That keeps the system explainable and easy to debug. A model can come later if the app has enough historical data.

---

## 3. Additional Suggestions

### 3.1 Confidence meter

#### Idea

Show how certain the app is about a match prediction.

#### Implementation

- calculate a confidence score from the spread between the top 3 outcomes
- show `high`, `medium`, or `low` confidence
- use it as a visual helper, not as a scoring rule

---

### 3.2 "Quick Pick" mode

#### Idea

Give users a one-click way to fill a whole matchday or the whole tournament with suggested predictions.

#### Implementation

- add a `Quick Pick` button on the fixtures page
- use the prediction engine to prefill each match
- let users edit individual matches afterward

---

### 3.3 Casual fan mode

#### Idea

Offer a simplified view for users who do not want to see every stat.

#### Implementation

- hide advanced stats by default
- show only the top 3 predictions, team profile summary, and match kickoff
- keep the full data available behind a toggle

---

### 3.4 Match explanation text

#### Idea

Explain why the app recommends a result.

#### Implementation

- generate a short text snippet from the same factors used in ranking
- keep it to one or two sentences
- make sure the explanation matches the actual prediction engine

Example:

- `Team A is higher ranked and has a stronger goal difference, so a narrow win is most likely.`

---

### 3.5 Upset alerts

#### Idea

Flag matches where the lower-ranked team has a real chance.

#### Implementation

- detect when the top 3 predictions are close together
- label the match as `upset watch`
- optionally surface a warning badge in the UI

---

### 3.6 Favorite team shortcuts

#### Idea

Let users mark favorite teams so those matches are easier to find.

#### Implementation

- store favorites in localStorage or user profile data
- add a highlight state in fixture lists and brackets
- optionally bias quick-pick suggestions toward favorite teams if the user wants that behavior

---

### 3.7 Team comparison panel

#### Idea

Add a direct side-by-side comparison between two teams.

#### Implementation

- compare ranking, form, goals for/against, and current group position
- show a simple advantage indicator per row
- reuse the same data source as the country profiles

---

### 3.8 Learning hints

#### Idea

Teach users how to read a match without making the app feel like a tutorial.

#### Implementation

- add tiny info chips such as `form`, `rank`, `goal diff`
- show a one-line tooltip for each stat
- keep the wording plain and short

---

## 4. Suggested Data Model

If these ideas are implemented, the project will likely need a small prediction support model.

### `country_profiles`

Possible fields:

- `team_id`
- `team_name`
- `flag_url`
- `confederation`
- `ranking`
- `style_tag`
- `summary`
- `updated_at`

### `match_prediction_suggestions`

Possible fields:

- `match_id`
- `team1`
- `team2`
- `top1_label`
- `top1_probability`
- `top2_label`
- `top2_probability`
- `top3_label`
- `top3_probability`
- `confidence_band`
- `generated_at`

This can be stored:

- on the worker response only
- in Supabase for caching
- or computed on demand if performance is fine

Recommended first choice:

- compute on demand, cache only if the UI or worker load becomes heavy

---

## 5. Implementation Order

Best order for rollout:

1. country profiles
2. top 3 predictions per game
3. confidence meter
4. quick pick mode
5. explanation text

That order works because:

- profiles and suggestions can reuse the same core team metadata
- the top 3 engine creates the base logic for every other suggestion feature
- the rest are UI layers on top of the same prediction support data

---

## 6. Risks and Constraints

### Risk: overcomplicating the UI

Too much data can make the app harder, not easier.

Mitigation:

- keep profiles compact
- hide advanced data behind expandable sections
- make top 3 predictions visible by default, but not noisy

### Risk: bad confidence logic

If the ranking engine is too naive, users may trust weak suggestions too much.

Mitigation:

- keep the model explainable
- show confidence as guidance, not certainty
- log and review suggestion quality

### Risk: stale profile data

Country information can drift if it is manually maintained.

Mitigation:

- split static metadata from live tournament stats
- update live values from the existing standings/results flow

---

## 7. Open Questions

Before implementation, decide:

- should top 3 predictions be scorelines or outcome buckets
- should country profiles be editable in admin tools or kept in static data
- should suggestions be visible to everyone or only in a "help me pick" mode
- should quick-pick suggestions be saved automatically or only prefilled

---

## 8. Success Criteria

These features are worth shipping if they:

- help a casual user make a reasonable prediction quickly
- reduce the need to understand football jargon
- reuse the same data sources as the rest of the app
- stay easy to maintain when tournament data changes

