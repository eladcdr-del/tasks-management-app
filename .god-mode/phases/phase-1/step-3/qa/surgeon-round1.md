# Surgeon round 1, step 1.3: all items done (merged 0e827ba)
- 651 parser tests, 100% lines; full unit 1269. dateMath.ts deleted (uses domain/dates + weekHorizon).
- Precision: numbers≠dates (context words, street names, fractions, decimals, units, >120 days), ב+bare day strict, composites, part-of-day AM/PM (3 בלילה=03:00), "5:30"→17:30, ranges, intensifiers/תזכיר לי/תאריך cleaned, עד introducers, strong/weak keywords (hardDeadline only with store/clothing word), colloquial forms, decisions (b)(c)(d).
- Chip API: `parseQuickAdd(input, now, tz, { dismissed })`; match has key/field/value/label/hard/extra/alsoSets; `deletePhraseFromInput` (old removeMatch deprecated).
- Deviations: "בשבת לנקות" no longer dated (needs "ביום שבת"); "מחר ב-8" leaves "ב-8" (needs part-of-day word) → backlog.
- Round-2 step QA folded into the Phase 1 council.
