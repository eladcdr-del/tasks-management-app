# Surgeon round 1, step 1.2: all items done

Merged as 1e37ad3. Results: 480 unit tests, 100% coverage, passes in 3 timezones, check 0/0.

## New and changed APIs
- **Search:** `scoreQuery`, ranking, stopwords, suffix fold, peeling only when ≥3 letters remain.
- **Age:** now takes the task: `ageDays(task)`, `ageLabel(task)`, `isStuck(task)`. Added `ageStart` and `ageDaysFrom`. Months are calendar months.
- **Recurrence:** anchor rule. `ensureAnchor(task)` takes no today parameter; adapters drop the old anchor when the date or frequency changes.
- **Format:**
  - `whenChip(task, today, now?)` returns `{text, tone}`.
  - Added `elapsedText`, `pluralTimes`, `snoozedLabel`, `plannedFromLabel`, `formatDate({withYear, today})`, `formatMonthYear`, `monthKey`, `daysUntil`, `validForLabel`, `SNOOZE_LABELS`.
  - `ageLabelText(start, today)`.
  - Uses the ׳ geresh. The greeting no longer says "לילה טוב".
- **Snooze** (`domain/snooze.ts`): `snoozeTargets`, `snoozeOptions(task, today)`, `snoozePatch(task, until, now, today)`.
- **Buckets:** `weekHorizon`, the new `needsAttention`, `groupTasks(open, today, memberIds?)`, `pulseCounts(open, today, memberIds?)`.
- **Dates:** `isoDateAt`, `msUntilNextLocalMidnight`.
- Round-2 step assessment is folded into the Phase 1 council (orchestrator decision).
