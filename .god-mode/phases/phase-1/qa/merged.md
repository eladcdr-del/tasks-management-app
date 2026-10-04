# Phase 1 Council: merged verdict IMPROVE (B-C1 Critical)

Majors raised by two or more judges:
- missed-hard-deadline snooze (A-M1 + B)
- gallery copy (A-M5 + B)
- bidi (C-M5 + A-m7)

## Orchestrator: fix the following in one round
**Parser:**
- C1, M1–M5 (B)
- "!!" never urgent
- weekPlan output
- hardDeadline only with a date
- weekly with no day → this week
- a dismissal must not promote a ש-clause

**Domain / format / search / notifier:**
- B-M6: search fallback, verbs, synonyms
- B-M7: hard deadline today or tomorrow → attention
- A-M1: missed hard deadline → soft
- snooze options deduped and sorted; `snoozeMaxDate`
- age in weeks up to 8
- copy fixes
- weekPlan display
- `Category.short`
- A-M3: timed-plan reminder
- stuck parity test

**Design system:**
- C-M1 through C-M5
- m1 tokens, m2 contrast, m5, m8, m9, m11, m12
- gallery mocks from the real formatters (A-M5)
- CategoryIcon
- AppMark full-bleed variant

**Data and contracts:**
- `Task.weekPlan`: rules, demo, seed, contract, schema doc
- photo sheet in `SheetSpec`; `access` in `RouteMeta`
- drop the pinned-copy test
- leave releases tasks (demo)

**State:** clock store (A-M4), sent to 2.4.
