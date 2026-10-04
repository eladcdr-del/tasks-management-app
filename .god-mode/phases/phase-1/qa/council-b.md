# Phase 1 Council: judge B (skeptical parent). Verdict: IMPROVE

**Method:** about 230 parser inputs; the seed run across 6 days; 57 house-memory queries; gallery screenshots.

**Strengths:**
- Calendar resolution is solid.
- The parser is conservative on phone numbers, quantities and prices.
- The seed-day picture is right (3/4/3).
- Search answers the Vision question.
- The design is warm and adult, and the tone is right.

## CRITICAL
**C1. Unpadded 6:xx and 7:xx become evening** (AFTERNOON_BEFORE_HOUR=8). "להעיר את הילדים ב-7:30" gives 19:30.
- Fix: hours 1–5 = PM.
- Hours 6–7 are ambiguous: no chip unless there is a part-of-day word or a strong cue.

## MAJOR
- **M1. Weekday + explicit date** ("ביום חמישי 15/10") resolves to the weekday's date, and the date is left in the title.
  - Fix: read the pair as one phrase and take the date. If they disagree, give no chip.
- **M2. Non-dates become dates:**
  - installments ("תשלום 3/10")
  - prices ("ב-29.9", "ב-19.9")
  - old explicit years (2020)
- **M3. Consumed words vanish or leave broken titles:**
  - the end of a time range is lost
  - parts of the day are swallowed
  - "לפני יום שישי" is inverted
  - orphaned words: במהלך, אבל
  - "חשוב לי ש…" and "אם דחוף" are read as priority
  - clause commas are eaten
  - Rule: never consume text that the chip does not carry.
- **M4. A lone time invents "today"** even when an unconsumed weekday word is present ("ארוחת שישי … 19:30").
- **M5. Common verbs produce wrong categories:**
  - להחזיר טלפון / כסף / ילדים → returns
  - להחליף סדינים / טיטול → returns
  - להזמין טכנאי / מונית / שולחן → shopping
  - בחשבון (school maths) → finance
- **M6. House memory:** natural questions with a past-tense verb return nothing. Examples: שילמנו, תיקן, עשינו, קנינו, עלה. Synonyms are missing (אוטו↔רכב). False positive: בלמים→משלמים.
  - Fix: fall back to OR ranking, add question verbs to the stopwords, add synonyms.
- **M7. A hard deadline on its last day** (or the day before) is not in attention, and the snooze sheet shows no options.

## MINOR
- "!!" and "!!!" mean urgent, but Israelis use them for emphasis.
- Missed phrasings: מחר ב-4, לשישי, במוצ״ש, a leading בראשון.
- A weekly task with no date lands in "later".
- A dismissal can promote a "ש-" clause.
- Age 31–59 days reads "פתוחה חודש". Suggest weeks up to 8.
- Snooze options: duplicate dates and unsorted order on Fri/Sat. A missed hard deadline keeps its hard flag after a snooze.
- Copy:
  - מתוכננת מאתמול → תוכננה לאתמול
  - "עדינות שבועית"
  - "יציאה מהבית"
  - "· עבר" → "· הזמן עבר"
  - "מועד אחרון: ד׳" → "מועד אחרון: יום ד׳"
- The gallery mock does not use the real formatters (31.10, ASCII apostrophe, short category labels).
- Sheet row dividers are inset unevenly. The unread dot looks like an artifact.
