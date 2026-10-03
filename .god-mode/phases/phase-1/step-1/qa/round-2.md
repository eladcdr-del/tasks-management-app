# Step 1.1 Assessment, round 2. Verdict: IMPROVE → exit by diminishing returns + orchestrator fixes

All round-1 findings (C1, M1–M7) verified fixed in real Chromium.

## New MAJOR
**N1.** The link handler ran in the capture phase on window, so no component could cancel a link click via `preventDefault()`.
- **Fixed by orchestrator:** bubble phase + `defaultPrevented` guard; rule 4 doc updated; 2 tests added.

## Minors
- (3) `#/new` link from Home left a duplicate Home entry. **Fixed:** `navigate('#/new')` from sheet-less Home calls `openSheet` in place; test added.
- (5) Pre-paint theme script leaked globals. **Fixed:** wrapped in an IIFE.
- (6) Fixed clock froze Date. **Fixed:** `page.clock.install({time})` so time flows; smoke asserts a drift window.
- (7) `--m-on` comment invited ink-on-base. **Fixed:** reworded.
- (1) 1s fallback-timer race with slow traversals → backlog.
- (2) Tab policy gaps (tab switch over an open sheet; Home tab after plain links) → backlog.
- (4) Cold-start deep link exits on hardware Back; verify on-device → backlog.

Exit: round 2 highest severity (Major) ≤ round 1 (Critical), count 1 < 8. Remaining minors logged. Gates after orchestrator fixes: check 0/0, unit 483, smoke E2E green.
