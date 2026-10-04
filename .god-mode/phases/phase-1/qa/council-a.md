# Phase 1 Council: judge A (staff engineer). Verdict: IMPROVE (0 Critical, 5 Major, 15 Minor)

## MAJOR
- **M1. Snoozing a missed hard deadline keeps `hardDeadline: true`.** This produces a fake lock-clock and a false "מחר אחרון" push.
  - Fix: the patch also sets `hardDeadline: false`.
- **M2. "השבוע" is stored as Saturday.**
  - Cards show "שבת", it lands in Today on Shabbat, and on Sunday reads "מתוכננת משבת".
  - Friday inversion: "השבוע" resolves after "בשבוע הבא".
  - Fix: decide on a week-plan representation.
- **M3. Timed plans (scheduledFor + dueTime, no dueDate) never get a due-day reminder.** Copy says "עד השעה".
- **M4. No reactive clock store.** The app goes stale overnight, and `msUntilNextLocalMidnight` is unused.
  - Sent to 2.4 as clock.svelte.ts.
- **M5. The gallery mock copy differs from the real formatters**, and short category labels are missing from the contract. Step 1.4 was never step-assessed.

## MINOR
1. Two keyword sources.
2. The `snoozePatch` comment is stale; `now` and `today` are redundant.
3. Two-way domain↔i18n dependency.
4. Five different shapes for "now".
5. The parser emits `hardDeadline` without a `dueDate`.
6. Former members are handled inconsistently. Leave does not release tasks; the planner only notifies owners.
7. `dir="auto"` left-aligns Latin-first titles.
8. Process markers and the pinned-copy test in `he.test.ts`.
9. No `CategoryIcon` component.
10. `SheetSpec` has no photo viewer; `RouteMeta` has no access class.
11. The snooze cap is not exported.
12. Static labels are scattered; `labels.ts` duplicates `format.ts`.
13. Undated recurring tasks never surface.
14. No `toDraft()`. A card in Today with a later dueDate shows only "עד …".
15. Decisions log says "לילה טוב"; motion durations are duplicated.

## Passed
- `weekHorizon` matches the parser.
- `bucketOf` matches `whenChip`.
- Recurrence anchors are correct.
- The stuck rule matches between domain and notifier (200k fuzz).
- The seed produces 3/4/3/5/4.
