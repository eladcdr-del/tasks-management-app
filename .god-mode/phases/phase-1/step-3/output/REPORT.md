# Step 1.3 REPORT: Hebrew quick-add parser (summary of the worker hand-back)

**Status:** DONE. Commit 69a722b on worktree-agent-a00a8d0dd8dacfbd1.
- Files touched: src/lib/parser/{quickAdd,lexicon,dateMath,quickAdd.test}.ts, nothing else.
- Quality checks:
  - 314 tests
  - coverage: 100% lines, 94.5% branches
  - 11 mutants, all killed
  - a 4000-case fuzz that never throws
  - linear time (0.5 ms for 300 characters)
  - check: 0/0

## API
- `parseQuickAdd(input, now, tz)`: ParseResult per §6. Absent fields are omitted.
- `removeMatch(input, match)`: deletes the phrase from the raw input.
- `rebuildTitle(input, matches)`: returns the title with only the given matches consumed. **The UI (3.3) should keep a set of dismissed chips and call `rebuildTitle`.** This implements "removing a chip re-adds its text to the title". A category match stays in the title, so dismissing a category chip just clears the field.
- `dateMath.ts` duplicates part of `domain/dates.ts`, because the two steps ran in parallel. Consolidate later (see backlog).

## Ambiguity decisions
- A named weekday means the next one strictly after today.
- A bare weekday name only counts after עד, ב, or יום.
- "סוף השבוע" means the coming Friday. On Friday it means today; on Saturday it means next Friday.
- "השבוע" means Saturday of the current week.
- "בשבוע הבא" means next Sunday. "בעוד שבוע" means today plus 7 days.
- A date without a year rolls forward to its next valid occurrence.
- "בשעה 5" means 17:00: a bare hour below 8 is read as PM.
- "מועד אחרון" works like עד and sets hardDeadline.
- Only the first phrase of each field is consumed.
- Guards against false matches:
  - "לא דחוף", "לדחוף" and "כל השבוע" are not parsed as fields.
  - Quantities such as "1/2 קילו" and "2.5 ליטר" are not dates.
- Known false positive: "לדוד" matches the boiler keyword (דוד appears in the spec's home list).
- Gotcha: the Write/Edit tools decode \uXXXX escapes into literal characters. Use \u{…} escapes in sources.
