# Step 1.2 Assessment, round 1. Verdict: IMPROVE

**Strengths:**
- Engineering is clean: strong DST handling and a TZ-proof test matrix.
- Coverage is genuinely 100% (285 of the step's own tests).

## CRITICAL
**C1 House-memory search fails the Vision's own example.** "מתי החלפנו מצבר ובאיזה מוסך?" does not find "החלפת מצבר".
- No stopwords, no inflection or construct-state handling.
- False positives: שמן→מנוי, כסף→ספר.

**C2 Age and stuck fire falsely.** They trigger for recurring instances (createdAt = completion time of the previous instance) and for future-planned tasks. As a result the Sunday nudge would nag about bills that are not due yet.

## MAJOR
**M1 Recurrence anchor drifts.** The 31st drifts to the 28th forever, Feb 29 is never restored, and a snooze shifts the series. The docs overclaim.

**M2 dueTime is ignored by formatters.** There is no chip for scheduledFor+dueTime, and no "time passed" tone.

**M3 Missing Hebrew helpers.**
- pluralTimes / snoozedLabel ("נדחתה פעמיים")
- plannedFromLabel (feminine, accurate beyond yesterday)
- formatMonthYear, formatDate with year
- daysUntil

**M4 Snooze has no visible effect** on dated, overdue or urgent tasks, and there are no snooze targets. Escalated; decided in decisions.md.

**M5 The "השבוע" tab is empty on Saturday,** and tomorrow's tasks fall into "later". Escalated; decided.

## MINOR
See `logs/backlog.md`, items prefixed `[1.2]`.
