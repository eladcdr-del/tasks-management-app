# Step 1.3 Assessment, round 1. Verdict: IMPROVE

Method: about 300 realistic inputs. The parser meets the §6 spec but breaks the Vision rule "a wrong chip is worse than no chip".

## CRITICAL
**C1. Numbers that are not dates become dates.** Examples: 1.5 / 2.5 אלף, 1/3, addresses ("הרצל 15/3", "דירה 4/12"), clothing sizes (מידה 10/12), iOS 17.1, grades (ציון 9/10). The title also loses the number.

**C2. "ב" + a weekday name is matched in non-date phrases** ("בראשון לציון", "בשני תשלומים", "בשני הילדים"). The title is damaged as a result.

**C3. Compound phrases are only partly parsed.**
- "ביום שלישי בשבוע הבא" gives this week's Tuesday.
- "סוף/תחילת החודש הבא" is not handled.
- "עד סוף היום" is not handled.
- "סדר היום" and "פרשת השבוע" are read as dates.
- "הבא" is left behind in the title.

**C4. Times are wrong.**
- "בשעה 6 בבוקר" gives 18:00.
- "בשעה 5:30" gives 05:30, inconsistent with "בשעה 5" giving 17:00.
- "ב-8 בבוקר" is missed.
- "בין X ל-Y" is not handled.

## MAJOR
- **M1.** "השבוע" ignores weekHorizon on Friday and Saturday. "סוף השבוע" on Friday conflicts with snoozeTargets and is not documented.
- **M2.** Generic category keywords beat specific ones. "להחליף מצבר עד…" becomes returns with hardDeadline set. Also: "שמן זית" → car, "בצבע" → home, "לדוד משה" → home, "מחשבון" → finance.
- **M3.** Leftover words in the title: מאוד, ממש, הכי, זה, לי, בבוקר, בערב, בתאריך, תזכיר לי.
- **M4.** The "עד" introducer is too narrow: "עד לתאריך" and "(עד מחר)" are missed.
- **M5.** The chip API is not ready for 3.3:
  - matches carry no label or value
  - "מועד אחרון" produces two due chips
  - the source of hardDeadline is hidden
  - rebuildTitle does not recompute fields
  - removeMatch is misleading
  - matches have no stable key, and there is no dismissed-chips parse option
- **M6.** Colloquial forms are missed: "יום א" without geresh, "עד ה-10", "כל יום שלישי" as weekly, "הערב", common misspellings.
- **M7.** Tests pin the wrong behaviour, and there is no negative corpus of real inputs that must produce no field.

## MINOR
See backlog, items prefixed `[1.3]`.
