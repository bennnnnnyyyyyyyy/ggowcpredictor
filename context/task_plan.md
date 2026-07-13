# Task Plan

## Goal
Fix the knockout bracket so it is readable at desktop scale, shows the same match metadata as prediction cards, and auto-fills confirmed bracket participants once the group stage ends.

## What the user wants
- Reduce the bracket zoom-out feeling so the visible tree is not stuck on only one side.
- Reduce spacing between individual bracket matches.
- Make each match card larger.
- Show month/day and stadium on bracket cards, same as prediction cards.
- Show the score on bracket cards.
- Grey out or strike through the losing team.
- Auto-fill knockout matches when group stage qualifiers are confirmed.

## Plan
1. Update the bracket implementation plan to describe the new desired bracket UX and auto-fill behavior.
2. Add a concrete autofill rule for knockout matches that become confirmed after group stage results are locked in.
3. Keep the bracket responsive, but preserve the visual tree structure and match card density.
4. Revisit the code only after the plan is locked so the next edit is targeted.

## Status
- [x] Capture user request
- [x] Read current bracket plan
- [x] Update plan documentation
- [x] Implement bracket UX changes
- [x] Implement post-group autofill behavior

## Update
- Bracket code pass completed: richer match cards, tighter density, live resolver display, and mobile tabs are wired up.
