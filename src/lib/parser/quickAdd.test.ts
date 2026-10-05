import { describe, expect, it } from 'vitest';
import { isValidISO } from '$lib/domain/dates';
import type { CategoryId } from '../domain/types';
import { CATEGORY_KEYWORDS, lit, MONTHS, WEEKDAYS } from './lexicon';
import {
  deletePhraseFromInput,
  parseQuickAdd,
  rebuildTitle,
  removeMatch,
  type ParseResult
} from './quickAdd';

// Date helpers moved to $lib/domain/dates (tested there) and ./util (util.test.ts).

// ───────────────────────────── parser helpers ─────────────────────────────

/** Sunday 2026-10-04, 09:00 in Asia/Jerusalem (IDT, UTC+3). */
const NOW = new Date('2026-10-04T06:00:00Z');
/** Wednesday 2026-10-07, 09:00 Jerusalem. */
const WED = new Date('2026-10-07T06:00:00Z');
/** Friday 2026-10-09, 09:00 Jerusalem. */
const FRI = new Date('2026-10-09T06:00:00Z');
/** Saturday 2026-10-10, 09:00 Jerusalem. */
const SAT = new Date('2026-10-10T06:00:00Z');

const parse = (input: string, now: Date = NOW): ParseResult => parseQuickAdd(input, now);

/** The parsed result without `matches`, for exact whole-object comparisons. */
const fields = (input: string, now: Date = NOW): Omit<ParseResult, 'matches'> => {
  const { matches: _matches, ...rest } = parse(input, now);
  return rest;
};

type Expected = Partial<Omit<ParseResult, 'matches'>> & { title: string };

// ───────────────────────────── Blueprint §6 required cases ─────────────────────────────

describe('Blueprint §6 required cases (now = Sunday 2026-10-04 09:00 Asia/Jerusalem)', () => {
  const cases: [string, Expected][] = [
    [
      'לקחת את האוטו למוסך מחר',
      { title: 'לקחת את האוטו למוסך', scheduledFor: '2026-10-05', categoryId: 'car' }
    ],
    [
      'להחזיר מכנסיים עד יום חמישי',
      {
        title: 'להחזיר מכנסיים',
        dueDate: '2026-10-08',
        hardDeadline: true,
        categoryId: 'returns'
      }
    ],
    ['דחוף לשלם ארנונה', { title: 'לשלם ארנונה', priority: 'urgent', categoryId: 'finance' }],
    [
      'תור לרופא שיניים בשבוע הבא',
      // a week plan ending next week's Saturday since the Phase 1 council
      {
        title: 'תור לרופא שיניים',
        scheduledFor: '2026-10-17',
        weekPlan: true,
        categoryId: 'health'
      }
    ],
    [
      'לקנות מתנה לדנה עד 15/10',
      { title: 'לקנות מתנה לדנה', dueDate: '2026-10-15', categoryId: 'shopping' }
    ],
    ['לברר על מזגן', { title: 'לברר על מזגן', categoryId: 'home' }],
    [
      'השבוע לתקן את הברז',
      // a week plan since the Phase 1 council
      { title: 'לתקן את הברז', scheduledFor: '2026-10-10', weekPlan: true, categoryId: 'home' }
    ],
    [
      'להשקות עציצים כל שבוע',
      {
        title: 'להשקות עציצים',
        scheduledFor: '2026-10-10',
        weekPlan: true,
        recurrence: { freq: 'weekly' }
      }
    ],
    [
      'חשמלאי ביום ראשון בשעה 17:30',
      { title: 'חשמלאי', scheduledFor: '2026-10-11', dueTime: '17:30', categoryId: 'home' }
    ],
    ['פגישה בבנק 3/1', { title: 'פגישה בבנק', scheduledFor: '2027-01-03', categoryId: 'finance' }],
    ['31/02 משהו', { title: '31/02 משהו' }],
    ['מחר', { title: 'מחר', scheduledFor: '2026-10-05' }],
    ['Netflix לבטל מנוי עד סוף החודש', { title: 'Netflix לבטל מנוי', dueDate: '2026-10-31' }],
    ['ביום שבת לנקות את המחסן', { title: 'לנקות את המחסן', scheduledFor: '2026-10-10' }],
    ['בעוד שבועיים טסט לרכב', { title: 'טסט לרכב', scheduledFor: '2026-10-18', categoryId: 'car' }]
  ];

  it.each(cases)('%s', (input, expected) => {
    expect(fields(input)).toEqual(expected);
  });
});

// ───────────────────────────── relative days ─────────────────────────────

describe('relative days', () => {
  it.each([
    ['להתקשר לסבתא היום', 'להתקשר לסבתא', '2026-10-04'],
    ['להתקשר לסבתא מחר', 'להתקשר לסבתא', '2026-10-05'],
    ['להתקשר לסבתא מחרתיים', 'להתקשר לסבתא', '2026-10-06'],
    ['מחר להתקשר לסבתא', 'להתקשר לסבתא', '2026-10-05'],
    ['להתקשר מחר לסבתא', 'להתקשר לסבתא', '2026-10-05']
  ])('%s', (input, title, scheduledFor) => {
    expect(fields(input)).toEqual({ title, scheduledFor });
  });

  it('computes "today" in Jerusalem, not UTC: 01:30 on the 5th is already the 5th', () => {
    const lateNight = new Date('2026-10-04T22:30:00Z'); // 01:30 Oct 5 in Jerusalem
    expect(fields('להתקשר לסבתא מחר', lateNight).scheduledFor).toBe('2026-10-06');
    expect(fields('להתקשר לסבתא היום', lateNight).scheduledFor).toBe('2026-10-05');
  });

  it('honours an explicit tz', () => {
    const lateNight = new Date('2026-10-04T22:30:00Z');
    expect(parseQuickAdd('להתקשר לסבתא היום', lateNight, 'UTC').scheduledFor).toBe('2026-10-04');
  });
});

// ───────────────────────────── Hebrew prefixes ─────────────────────────────

describe('Hebrew prefixes ו/ה/ב/ל/מ/ש/כ (up to two)', () => {
  it.each([
    ['להתקשר ומחר', '2026-10-05'],
    ['להתקשר למחר', '2026-10-05'],
    ['להתקשר שמחר', '2026-10-05'],
    ['להתקשר ולמחר', '2026-10-05'],
    ['להתקשר ושמחר', '2026-10-05'],
    ['להתקשר והיום', '2026-10-04'],
    ['להתקשר ממחר', '2026-10-05'], // מ
    ['להתקשר כמחר', '2026-10-05'], // כ
    ['להתקשר וממחר', '2026-10-05'],
    ['להתקשר כשמחר', '2026-10-05'],
    ['להתקשר ולמחרתיים', '2026-10-06'],
    ['להתקשר וביום חמישי', '2026-10-08'],
    ['להתקשר ליום חמישי', '2026-10-08'],
    ['להתקשר ובחמישי', '2026-10-08'],
    ['להתקשר בחודש הבא', '2026-11-01'],
    ['להתקשר ובסוף החודש', '2026-10-31']
  ])('%s', (input, scheduledFor) => {
    expect(fields(input)).toEqual({ title: 'להתקשר', scheduledFor });
  });

  // next week is a week plan ending its Saturday (Phase 1 council)
  it.each(['להתקשר ובשבוע הבא', 'להתקשר לשבוע הבא', 'להתקשר השבוע הבא'])('%s', (input) => {
    expect(fields(input)).toEqual({ title: 'להתקשר', scheduledFor: '2026-10-17', weekPlan: true });
  });

  it('treats a detached one-letter prefix (from a hyphen) as part of the phrase', () => {
    expect(fields('להתקשר ב-מחר')).toEqual({ title: 'להתקשר', scheduledFor: '2026-10-05' });
    expect(fields('להתקשר ל\u{5BE}מחר')).toEqual({ title: 'להתקשר', scheduledFor: '2026-10-05' });
  });

  it('does not match with three prefix letters or in the middle of a longer word', () => {
    expect(fields('להתקשר ובלמחר').scheduledFor).toBeUndefined(); // 3 prefixes
    expect(fields('להתקשר אומחר').scheduledFor).toBeUndefined(); // mid-word
    expect(fields('מחרוזת לקנות').scheduledFor).toBeUndefined(); // "מחר" + "וזת" is another word
    expect(fields('שגרת היומיום').scheduledFor).toBeUndefined(); // "היום" + "יום"
    expect(fields('מחרתיים').scheduledFor).toBe('2026-10-06'); // and מחר does not eat מחרתיים
  });

  it('"מהיום" means "from now on", not today (round-2 minor)', () => {
    expect(fields('להתקשר ומהיום').scheduledFor).toBeUndefined();
  });
});

// ───────────────────────────── weekdays ─────────────────────────────

describe('weekday names resolve to the next occurrence strictly after today', () => {
  // now = Sunday 2026-10-04
  const week: [string, string, string][] = [
    ['ראשון', 'א', '2026-10-11'], // today is Sunday, so the NEXT Sunday
    ['שני', 'ב', '2026-10-05'],
    ['שלישי', 'ג', '2026-10-06'],
    ['רביעי', 'ד', '2026-10-07'],
    ['חמישי', 'ה', '2026-10-08'],
    ['שישי', 'ו', '2026-10-09'],
    ['שבת', 'ש', '2026-10-10']
  ];

  it.each(week)('יום %s (letter %s)', (name, letter, iso) => {
    expect(fields(`ביקור ביום ${name}`)).toEqual({ title: 'ביקור', scheduledFor: iso });
    expect(fields(`ביקור יום ${name}`)).toEqual({ title: 'ביקור', scheduledFor: iso });
    expect(fields(`ביקור ליום ${name}`)).toEqual({ title: 'ביקור', scheduledFor: iso });
    expect(fields(`ביקור ב${name}`)).toEqual({ title: 'ביקור', scheduledFor: iso });
    // letter form, with geresh U+05F3, ASCII apostrophe, and right single quote
    for (const mark of ['\u{5F3}', "'", '\u{2019}']) {
      expect(fields(`ביקור ביום ${letter}${mark}`)).toEqual({ title: 'ביקור', scheduledFor: iso });
    }
  });

  it('"יום ה\'" is Thursday, with geresh or ASCII apostrophe, and keeps the rest of the title', () => {
    expect(fields("לקבוע תור ביום ה'").scheduledFor).toBe('2026-10-08');
    expect(fields('לקבוע תור ביום ה\u{5F3}').scheduledFor).toBe('2026-10-08');
    expect(fields("יום ה' לקנות חלב")).toEqual({
      title: 'לקנות חלב',
      scheduledFor: '2026-10-08',
      categoryId: 'shopping' // "לקנות" stays in the title and sets the category
    });
  });

  it('does not mistake "יום הולדת" for a weekday; a geresh-less "יום ה" is Thursday (M6)', () => {
    expect(fields('יום הולדת לדנה').scheduledFor).toBeUndefined();
    expect(fields('יום ה לקנות').scheduledFor).toBe('2026-10-08');
  });

  it('bare weekday names are only dates after "עד" (otherwise שני = "two" etc.)', () => {
    expect(fields('לקנות שני חלבים').scheduledFor).toBeUndefined();
    expect(fields('פגישה שישי בערב').scheduledFor).toBeUndefined();
    // a returns verb with no strong signal is no category at all, so no hardDeadline (council M5)
    expect(fields('להחזיר עד חמישי')).toEqual({
      title: 'להחזיר',
      dueDate: '2026-10-08'
    });
    expect(fields('לסדר עד לחמישי')).toEqual({ title: 'לסדר', dueDate: '2026-10-08' });
    expect(fields('לסדר עד ליום חמישי')).toEqual({ title: 'לסדר', dueDate: '2026-10-08' });
  });

  it('swallows a trailing "הקרוב/הקרובה" (the coming one) instead of stranding it in the title', () => {
    expect(fields('ללכת לסבתא ביום חמישי הקרוב')).toEqual({
      title: 'ללכת לסבתא',
      scheduledFor: '2026-10-08'
    });
    expect(fields('לנקות בשבת הקרובה')).toEqual({ title: 'לנקות', scheduledFor: '2026-10-10' });
    expect(fields('לסדר עד חמישי הקרוב')).toEqual({ title: 'לסדר', dueDate: '2026-10-08' });
    expect(fields('לנקות ביום שבת הקרובים').title).toBe('לנקות הקרובים');
  });

  it('"every Sunday" is a weekly recurrence starting next Sunday, not a one-off date (M6)', () => {
    expect(fields('לכבס כל יום ראשון')).toEqual({
      title: 'לכבס',
      scheduledFor: '2026-10-11',
      recurrence: { freq: 'weekly' }
    });
  });

  it('when today is Saturday, "ביום שבת" means NEXT Saturday', () => {
    expect(fields('לנקות ביום שבת', SAT).scheduledFor).toBe('2026-10-17');
    expect(fields('לנקות ביום ראשון', SAT).scheduledFor).toBe('2026-10-11');
  });

  it('when today is Friday, "ביום שישי" means next Friday', () => {
    expect(fields('לנקות ביום שישי', FRI).scheduledFor).toBe('2026-10-16');
  });
});

// ───────────────────────────── week / month phrases ─────────────────────────────

describe('week and month phrases', () => {
  it('"השבוע" is weekHorizon(today): this Saturday, or next Saturday on Friday/Saturday (M1)', () => {
    expect(fields('להתקשר השבוע').scheduledFor).toBe('2026-10-10');
    expect(fields('להתקשר השבוע', WED).scheduledFor).toBe('2026-10-10');
    expect(fields('להתקשר השבוע', FRI).scheduledFor).toBe('2026-10-17');
    expect(fields('להתקשר השבוע', SAT).scheduledFor).toBe('2026-10-17');
  });

  it('"סוף השבוע" and all weekend spellings are the coming Friday, not the Saturday of "השבוע"', () => {
    const variants = [
      'סוף השבוע',
      'בסוף השבוע',
      'סוף שבוע',
      'בסוף שבוע',
      'בסופ"ש',
      'בסופ\u{5F4}ש', // gershayim
      'בסופ\u{201D}ש', // right double quote
      'סופ"ש',
      'בסופש'
    ];
    for (const v of variants) {
      expect(fields(`להתקשר ${v}`)).toEqual({ title: 'להתקשר', scheduledFor: '2026-10-09' });
    }
  });

  it('"סוף השבוע" is a single match, "השבוע" inside it is not matched twice', () => {
    const r = parse('להתקשר סוף השבוע');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]?.text).toBe('סוף השבוע');
    expect(r.title).toBe('להתקשר');
  });

  it('weekend on a Friday is today, on a Saturday it is the coming Friday', () => {
    expect(fields('להתקשר בסופש', FRI).scheduledFor).toBe('2026-10-09');
    expect(fields('להתקשר בסופש', SAT).scheduledFor).toBe('2026-10-16');
    expect(fields('להתקשר בסופש', WED).scheduledFor).toBe('2026-10-09');
  });

  it('"בשבוע הבא" is a plan ending next week\'s Saturday, unlike "בעוד שבוע" (today + 7)', () => {
    expect(fields('להתקשר בשבוע הבא', WED).scheduledFor).toBe('2026-10-17');
    expect(fields('להתקשר בעוד שבוע', WED).scheduledFor).toBe('2026-10-14');
    expect(fields('להתקשר בשבוע הבא', SAT).scheduledFor).toBe('2026-10-17');
    expect(fields('להתקשר בשבוע הבא').scheduledFor).toBe('2026-10-17');
  });

  it('"בחודש הבא" is the 1st of next month, "סוף החודש" the last day', () => {
    expect(fields('להתקשר בחודש הבא').scheduledFor).toBe('2026-11-01');
    expect(fields('להתקשר בסוף החודש').scheduledFor).toBe('2026-10-31');
    expect(fields('להתקשר סוף חודש').scheduledFor).toBe('2026-10-31');
    expect(fields('להתקשר בחודש הבא', new Date('2026-12-20T10:00:00Z')).scheduledFor).toBe(
      '2027-01-01'
    );
    expect(fields('להתקשר בסוף החודש', new Date('2026-02-10T10:00:00Z')).scheduledFor).toBe(
      '2026-02-28'
    );
  });

  it('does not schedule "כל השבוע" (all week long) or "כל היום"', () => {
    expect(fields('להתאמן כל השבוע')).toEqual({ title: 'להתאמן כל השבוע' });
    expect(fields('לעבוד כל היום')).toEqual({ title: 'לעבוד כל היום' });
  });
});

describe('"בעוד …" relative offsets', () => {
  it.each([
    ['בעוד 3 ימים', '2026-10-07'],
    ['בעוד יום', '2026-10-05'],
    ['בעוד יומיים', '2026-10-06'],
    ['בעוד שלושה ימים', '2026-10-07'],
    ['בעוד עשרה ימים', '2026-10-14'],
    ['בעוד שבוע', '2026-10-11'],
    ['בעוד שבועיים', '2026-10-18'],
    ['בעוד 3 שבועות', '2026-10-25'],
    ['בעוד חודש', '2026-11-04'],
    ['בעוד חודשיים', '2026-12-04'],
    ['בעוד 2 חודשים', '2026-12-04'],
    ['ובעוד שבוע', '2026-10-11']
  ])('%s', (phrase, scheduledFor) => {
    expect(fields(`לבדוק ${phrase}`)).toEqual({ title: 'לבדוק', scheduledFor });
  });

  it('clamps a month offset to the end of a shorter month', () => {
    expect(fields('לבדוק בעוד חודש', new Date('2026-10-31T10:00:00Z')).scheduledFor).toBe(
      '2026-11-30'
    );
  });

  it('ignores zero and absurd counts', () => {
    expect(fields('לבדוק בעוד 0 ימים').scheduledFor).toBeUndefined();
    expect(fields('לבדוק בעוד 5000 ימים').scheduledFor).toBeUndefined();
  });
});

// ───────────────────────────── "עד" => dueDate ─────────────────────────────

describe('"עד" + a date phrase moves the date to dueDate', () => {
  it.each([
    ['עד היום', '2026-10-04'],
    ['עד מחר', '2026-10-05'],
    ['ועד מחר', '2026-10-05'],
    ['עד מחרתיים', '2026-10-06'],
    ['עד יום חמישי', '2026-10-08'],
    ['עד ליום חמישי', '2026-10-08'],
    ['עד חמישי', '2026-10-08'],
    ['עד שבת', '2026-10-10'],
    ['עד השבוע', '2026-10-10'],
    ['עד סוף השבוע', '2026-10-09'],
    ['עד סוף החודש', '2026-10-31'],
    ['עד בעוד שבועיים', '2026-10-18'],
    ['עד שבוע הבא', '2026-10-11'],
    ['עד ה-15 באוקטובר', '2026-10-15']
  ])('%s', (phrase, dueDate) => {
    expect(fields(`לסדר ${phrase}`)).toEqual({ title: 'לסדר', dueDate });
  });

  it('leaves a non-date "עד" alone', () => {
    expect(fields('לחכות עד שהוא יחזור')).toEqual({ title: 'לחכות עד שהוא יחזור' });
  });

  it('"עד" and a separate plain date can coexist (soft plan + deadline)', () => {
    expect(fields('לסדר מחר עד יום חמישי')).toEqual({
      title: 'לסדר',
      scheduledFor: '2026-10-05',
      dueDate: '2026-10-08'
    });
  });
});

describe('hardDeadline', () => {
  it('is set when a returns keyword comes with "עד <date>"', () => {
    for (const word of ['להחזיר', 'להחליף', 'החזרה', 'החלפה', 'זיכוי']) {
      expect(fields(`${word} חולצה עד 15/10`)).toEqual({
        title: `${word} חולצה`,
        dueDate: '2026-10-15',
        hardDeadline: true,
        categoryId: 'returns'
      });
    }
  });

  it('is not set for a returns keyword without "עד", or for other categories with "עד"', () => {
    expect(fields('להחזיר חולצה מחר')).toEqual({
      title: 'להחזיר חולצה',
      scheduledFor: '2026-10-05',
      categoryId: 'returns'
    });
    expect(fields('לקנות חלב עד מחר').hardDeadline).toBeUndefined();
  });

  it('"מועד אחרון" is a hard deadline and introduces the due date like "עד"', () => {
    const expected = {
      title: 'לשלם ארנונה',
      dueDate: '2026-10-15',
      hardDeadline: true,
      categoryId: 'finance'
    };
    expect(fields('מועד אחרון 15/10 לשלם ארנונה')).toEqual(expected);
    expect(fields('לשלם ארנונה מועד אחרון: 15/10')).toEqual(expected);
    expect(fields('לשלם ארנונה, מועד אחרון - 15/10')).toEqual(expected);
  });

  it('"מועד אחרון" with the date elsewhere in the line promotes that date to dueDate', () => {
    expect(fields('מועד אחרון לשלם ארנונה 15/10')).toEqual({
      title: 'לשלם ארנונה',
      dueDate: '2026-10-15',
      hardDeadline: true,
      categoryId: 'finance'
    });
  });

  it('"מועד אחרון" alone is not parsed: a hard deadline needs a date (Phase 1 council)', () => {
    expect(fields('מועד אחרון לשלם ארנונה')).toEqual({
      title: 'מועד אחרון לשלם ארנונה',
      categoryId: 'finance'
    });
  });
});

// ───────────────────────────── numeric dates ─────────────────────────────

describe('numeric dates: dd/mm, dd.mm, dd/mm/yy(yy), "ב-15/10"', () => {
  it.each([
    ['15/10', '2026-10-15'],
    ['15.10', '2026-10-15'],
    ['4/10', '2026-10-04'], // today stays today
    ['3/10', '2026-10-03'], // passed by 1 day: stays this year, overdue (decision c)
    ['3/1', '2027-01-03'], // 91 days ahead: still a date
    ['03/01', '2027-01-03'],
    ['03.01', '2027-01-03'],
    ['1/12', '2026-12-01'],
    ['ב-29/2', '2028-02-29'], // next leap year (introduced: un-introduced is > 120 days ahead)
    ['15/10/2027', '2027-10-15'],
    ['15.10.2027', '2027-10-15'],
    ['15/10/27', '2027-10-15'],
    ['15.10.27', '2027-10-15'],
    ['1/10/2026', '2026-10-01'], // an explicit year within the 14-day grace is taken literally
    ['ב-15/10', '2026-10-15'],
    ['ב\u{5BE}15/10', '2026-10-15'],
    ['ב15/10', '2026-10-15'],
    ['ל-15/10', '2026-10-15'],
    ['ה-15/10', '2026-10-15'],
    ['וב-15/10', '2026-10-15'],
    ['ב-3/1', '2027-01-03']
  ])('%s', (phrase, scheduledFor) => {
    expect(fields(`לבדוק ${phrase}`)).toEqual({ title: 'לבדוק', scheduledFor });
    expect(fields(`${phrase} לבדוק`)).toEqual({ title: 'לבדוק', scheduledFor });
  });

  it('ignores invalid and malformed dates and leaves them in the title', () => {
    for (const bad of [
      '31/02',
      '31/04',
      '30/2',
      '32/1',
      '0/5',
      '5/0',
      '5/13',
      '29/2/2027',
      '15/10/1999',
      '100/200',
      '2.0.1',
      '10:30:15'
    ]) {
      expect(fields(`לבדוק ${bad}`)).toEqual({ title: `לבדוק ${bad}` });
    }
  });

  it('reads a quantity or a price as a number, not a date, so a shopping list keeps its text', () => {
    for (const input of [
      'לקנות 1/2 קילו גבינה',
      'לקנות 2.5 ליטר חלב',
      'לקנות 1/2 ק"ג עגבניות',
      'לקנות 3/4 כוס סוכר',
      'לשלם 3.5 ₪',
      'לשלם ₪3.5',
      'לשלם $ 1.5',
      'ריבית 1.5% בחודש'
    ]) {
      const r = parse(input);
      expect(r.scheduledFor, input).toBeUndefined();
      expect(r.title, input).toBe(input);
    }
    // a bare 2.5 is a number too (C1c), not 2 May
    expect(fields('לבדוק 2.5')).toEqual({ title: 'לבדוק 2.5' });
  });

  it('"עד" + each date form moves it to dueDate', () => {
    for (const phrase of ['15/10', '15.10', '15/10/2026', '15/10/26', 'ב-15/10', 'ה-15/10']) {
      expect(fields(`לסדר עד ${phrase}`)).toEqual({ title: 'לסדר', dueDate: '2026-10-15' });
    }
    expect(fields('לסדר עד 15 באוקטובר')).toEqual({ title: 'לסדר', dueDate: '2026-10-15' });
  });

  it('does not eat a sentence-ending dot', () => {
    expect(fields('לבדוק עד 15/10.')).toEqual({ title: 'לבדוק', dueDate: '2026-10-15' });
  });
});

describe('Hebrew month names', () => {
  const months: [string, string, string][] = [
    ['ינואר', '2027-01-15', 'פברואר'],
    ['פברואר', '2027-02-15', 'מרץ'],
    ['מרץ', '2027-03-15', 'אפריל'],
    ['מרס', '2027-03-15', 'מאי'],
    ['אפריל', '2027-04-15', 'יוני'],
    ['מאי', '2027-05-15', 'יולי'],
    ['יוני', '2027-06-15', 'אוגוסט'],
    ['יולי', '2027-07-15', 'ספטמבר'],
    ['אוגוסט', '2027-08-15', 'אוקטובר'],
    ['ספטמבר', '2027-09-15', 'נובמבר'],
    ['אוקטובר', '2026-10-15', 'דצמבר'],
    ['נובמבר', '2026-11-15', 'ינואר'],
    ['דצמבר', '2026-12-15', 'פברואר']
  ];

  it.each(months)('15 ב%s (and without prefix, with ל, with ה-)', (name, iso) => {
    for (const phrase of [
      `15 ב${name}`,
      `15 ל${name}`,
      `15 ${name}`,
      `ה-15 ב${name}`,
      `ב-15 ב${name}`
    ]) {
      expect(fields(`לשלם ${phrase}`)).toEqual({
        title: 'לשלם',
        scheduledFor: iso,
        categoryId: 'finance'
      });
    }
  });

  it('covers all twelve months', () => {
    const seen = new Set(months.map(([, iso]) => iso.slice(5, 7)));
    expect([...seen].sort()).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12'
    ]);
  });

  it('"3 בינואר" rolls over to next year, "4 באוקטובר" is today, "3 באוקטובר" stays (overdue)', () => {
    expect(fields('פגישה 3 בינואר').scheduledFor).toBe('2027-01-03');
    expect(fields('פגישה 4 באוקטובר').scheduledFor).toBe('2026-10-04');
    expect(fields('פגישה 3 באוקטובר').scheduledFor).toBe('2026-10-03');
  });

  it('takes an explicit year literally', () => {
    expect(fields('פגישה 15 באוקטובר 2027')).toEqual({
      title: 'פגישה',
      scheduledFor: '2027-10-15'
    });
    expect(fields('פגישה 25 בספטמבר 2026').scheduledFor).toBe('2026-09-25');
    // further back than the 14-day grace it is no date at all (council M2)
    expect(fields('פגישה 15 בינואר 2026').scheduledFor).toBeUndefined();
  });

  it('ignores impossible dates', () => {
    expect(fields('פגישה 31 בפברואר')).toEqual({ title: 'פגישה 31 בפברואר' });
    expect(fields('פגישה 31 בנובמבר').scheduledFor).toBeUndefined();
    expect(fields('פגישה 32 באוקטובר').scheduledFor).toBeUndefined();
  });

  it('a month name without a day is not a date', () => {
    expect(fields('פגישה באוקטובר')).toEqual({ title: 'פגישה באוקטובר' });
  });
});

// ───────────────────────────── times ─────────────────────────────

describe('dueTime', () => {
  it.each([
    ['ב-17:00', '17:00'],
    ['ב\u{5BE}17:00', '17:00'],
    ['ב17:00', '17:00'],
    ['בשעה 17:30', '17:30'],
    ['בשעה 17.30', '17:30'],
    ['בשעה 17', '17:00'],
    ['בשעה 5', '17:00'], // 1–5: afternoon
    ['בשעה 1', '13:00'],
    // (an unpadded 6 or 7 with no cue is ambiguous since the council: see council.test.ts)
    ['בשעה 8', '08:00'],
    ['בשעה 9', '09:00'],
    ['בשעה 12', '12:00'],
    ['בשעה 07', '07:00'], // zero-padded is literal
    ['בשעה 5:30', '17:30'], // unpadded H:MM under 8 is afternoon too (C4)
    ['בשעה 05:30', '05:30'], // zero-padded is literal
    ['ב-9:05', '09:05'],
    ['ב-08:15', '08:15'],
    ['השעה 17:30', '17:30'],
    ['שעה 4', '16:00'],
    ['17:30', '17:30'],
    ['8:00', '08:00'],
    ['עד 17:00', '17:00'],
    ['עד השעה 5', '17:00'],
    ['ב-23:59', '23:59'],
    ['ב-0:00', '00:00']
  ])('%s', (phrase, dueTime) => {
    // decision (d): no date, so today if the time is still ahead (now is 09:00), else tomorrow
    const scheduledFor = dueTime > '09:00' ? '2026-10-04' : '2026-10-05';
    expect(fields(`להתקשר ${phrase}`)).toEqual({ title: 'להתקשר', dueTime, scheduledFor });
  });

  it('rejects impossible clock times and bare numbers', () => {
    for (const bad of ['בשעה 25', 'ב-17:75', '24:00', 'בשעה 17.75', 'ב-5', '5']) {
      expect(fields(`לקנות ${bad}`).dueTime).toBeUndefined();
    }
    expect(fields('להתקשר בשעה')).toEqual({ title: 'להתקשר בשעה' });
  });

  it('combines with a date, in either order, and with a due date', () => {
    expect(fields('להתקשר מחר בשעה 5')).toEqual({
      title: 'להתקשר',
      scheduledFor: '2026-10-05',
      dueTime: '17:00'
    });
    expect(fields('להתקשר ב-17:30 ביום חמישי')).toEqual({
      title: 'להתקשר',
      scheduledFor: '2026-10-08',
      dueTime: '17:30'
    });
    expect(fields('להתקשר עד מחר ב-17:00')).toEqual({
      title: 'להתקשר',
      dueDate: '2026-10-05',
      dueTime: '17:00'
    });
  });

  it('a time with a dot after בשעה is not mistaken for a dd.mm date', () => {
    const today = '2026-10-04';
    expect(fields('להתקשר בשעה 17.10')).toEqual({
      title: 'להתקשר',
      dueTime: '17:10',
      scheduledFor: today
    });
    // the PM guess applies to unpadded H.MM like H:MM (C4)
    expect(fields('להתקשר בשעה 5.10')).toEqual({
      title: 'להתקשר',
      dueTime: '17:10',
      scheduledFor: today
    });
  });
});

// ───────────────────────────── priority ─────────────────────────────

describe('priority', () => {
  it('"!!" is high: emphasis, never urgent on its own (Phase 1 council)', () => {
    expect(fields('לשלם ארנונה !!')).toEqual({
      title: 'לשלם ארנונה',
      priority: 'high',
      categoryId: 'finance'
    });
    expect(fields('!! לשלם ארנונה').priority).toBe('high');
    expect(fields('לשלם!! ארנונה')).toEqual({
      title: 'לשלם ארנונה',
      priority: 'high',
      categoryId: 'finance'
    });
    expect(fields('לשלם ארנונה!!!').priority).toBe('high');
  });

  it('a single "!" sets nothing and stays in the title (decision b)', () => {
    expect(fields('לשלם ארנונה !')).toEqual({ title: 'לשלם ארנונה !', categoryId: 'finance' });
    expect(fields('לשלם ארנונה!').priority).toBeUndefined();
    expect(fields('! לשלם ארנונה').priority).toBeUndefined();
  });

  it('דחוף is urgent and חשוב is high, with prefixes and feminine forms', () => {
    expect(fields('דחוף לקנות חלב').priority).toBe('urgent');
    expect(fields('ודחוף לקנות חלב').priority).toBe('urgent');
    expect(fields('משימה דחופה').priority).toBe('urgent');
    expect(fields('חשוב לקנות חלב').priority).toBe('high');
    expect(fields('משימה חשובה').priority).toBe('high');
    expect(fields('חשוב לקנות חלב')).toEqual({
      title: 'לקנות חלב',
      priority: 'high',
      categoryId: 'shopping'
    });
  });

  it('an attached or adjacent "!" belongs to the same phrase, and the highest level wins', () => {
    expect(fields('דחוף! לשלם ארנונה').title).toBe('לשלם ארנונה');
    expect(fields('לשלם ארנונה דחוף !!').title).toBe('לשלם ארנונה');
    expect(fields('דחוף!! לשלם ארנונה')).toEqual({
      title: 'לשלם ארנונה',
      priority: 'urgent',
      categoryId: 'finance'
    });
    expect(fields('דחוף חשוב לשלם ארנונה').priority).toBe('urgent');
    expect(fields('חשוב דחוף לשלם ארנונה').title).toBe('לשלם ארנונה');
  });

  it('does not read a negated priority, or a verb that merely looks like one', () => {
    expect(fields('לא דחוף לקנות חלב').priority).toBeUndefined();
    expect(fields('לא דחוף!').priority).toBeUndefined();
    // a single "!" is just punctuation (decision b)
    expect(fields('לא חשוב לקנות חלב!').priority).toBeUndefined();
    expect(fields('לדחוף את העגלה').priority).toBeUndefined();
    expect(fields('לחשוב על מתנה').priority).toBeUndefined();
  });

  it('ignores "?!" and bare punctuation inside a question', () => {
    expect(fields('מה עם הרכב?!').priority).toBeUndefined();
    expect(fields('מה עם הרכב!?').priority).toBeUndefined();
  });

  it('a lone "!!" input keeps itself as the title', () => {
    expect(fields('!!')).toEqual({ title: '!!' });
    expect(fields('!')).toEqual({ title: '!' });
  });
});

// ───────────────────────────── recurrence ─────────────────────────────

/** A weekly repeat with no day is this week's plan (Phase 1 council). */
const weekPlanOf = (freq: string) =>
  freq === 'weekly' ? { scheduledFor: '2026-10-10', weekPlan: true } : {};

describe('recurrence', () => {
  it.each([
    ['כל שבוע', 'weekly'],
    ['פעם בשבוע', 'weekly'],
    ['בכל שבוע', 'weekly'],
    ['וכל שבוע', 'weekly'],
    ['כל חודש', 'monthly'],
    ['פעם בחודש', 'monthly'],
    ['כל שנה', 'yearly'],
    ['פעם בשנה', 'yearly']
  ])('%s', (phrase, freq) => {
    const expected = { title: 'להשקות עציצים', ...weekPlanOf(freq), recurrence: { freq } };
    expect(fields(`להשקות עציצים ${phrase}`)).toEqual(expected);
    expect(fields(`${phrase} להשקות עציצים`)).toEqual(expected);
  });

  it.each([
    ['שבועי', 'weekly'],
    ['שבועית', 'weekly'],
    ['חודשי', 'monthly'],
    ['חודשית', 'monthly'],
    ['שנתי', 'yearly'],
    ['שנתית', 'yearly']
  ])('adjective %s: at the start or after punctuation, not right after a noun', (word, freq) => {
    const expected = { title: 'להשקות עציצים', ...weekPlanOf(freq), recurrence: { freq } };
    expect(fields(`${word} להשקות עציצים`)).toEqual(expected);
    expect(fields(`להשקות עציצים - ${word}`)).toEqual(expected);
    expect(fields(`להשקות עציצים, ${word}`)).toEqual(expected);
    expect(fields(`להשקות עציצים ${word}`)).toEqual({ title: `להשקות עציצים ${word}` });
  });

  it('does not read "every two weeks" as weekly', () => {
    expect(fields('להשקות עציצים כל שבועיים')).toEqual({ title: 'להשקות עציצים כל שבועיים' });
  });

  it('combines with a date', () => {
    expect(fields('לכבס ביום ראשון כל שבוע')).toEqual({
      title: 'לכבס',
      scheduledFor: '2026-10-11',
      recurrence: { freq: 'weekly' }
    });
    expect(fields('לשלם ארנונה כל חודש')).toEqual({
      title: 'לשלם ארנונה',
      recurrence: { freq: 'monthly' },
      categoryId: 'finance'
    });
  });
});

// ───────────────────────────── categories ─────────────────────────────

describe('lexicon', () => {
  it('lists categories in Blueprint §6 table order (the first match wins)', () => {
    expect(CATEGORY_KEYWORDS.map((c) => c.id)).toEqual([
      'returns',
      'car',
      'health',
      'finance',
      'home',
      'shopping',
      'family'
    ]);
  });

  it('has all twelve months and all seven weekdays', () => {
    expect(MONTHS.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(WEEKDAYS.map((d) => d.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('lit() turns spaces into whitespace runs and quotes into optional marks', () => {
    expect(new RegExp(`^${lit('סוף השבוע')}$`).test('סוף   השבוע')).toBe(true);
    expect(new RegExp(`^${lit('סופ"ש')}$`).test('סופש')).toBe(true);
    expect(new RegExp(`^${lit('סופ"ש')}$`).test('סופ"ש')).toBe(true);
    expect(new RegExp(`^${lit("פנצ'ר")}$`).test('פנצר')).toBe(true);
    expect(new RegExp(`^${lit('a.b')}$`).test('axb')).toBe(false); // metacharacters are escaped
  });
});

describe('categories', () => {
  const keywords: [CategoryId, string[]][] = [
    ['returns', ['להחזיר', 'להחליף', 'החזרה', 'החלפה', 'החלפת', 'החזרת', 'זיכוי']],
    ['car', ['רכב', 'מוסך', 'טסט', 'צמיג', 'צמיגים', 'מצבר', "פנצ'ר", 'פנצר', 'ביטוח רכב']],
    [
      'health',
      ['רופא', 'רופאה', 'רופאת', 'בדיקה', 'מרפאה', 'שיניים', 'תרופה', 'מרשם', 'קופת חולים']
    ],
    [
      'finance',
      [
        'ארנונה',
        'חשבון',
        'חשבונית',
        'בנק',
        'מס',
        'ביטוח',
        'טופס',
        'לשלם',
        'תשלום',
        'ביטוח לאומי',
        'משכנתא'
      ]
    ],
    [
      'home',
      [
        'לתקן',
        'תיקון',
        'נזילה',
        'אינסטלטור',
        'חשמלאי',
        'מזגן',
        'נורה',
        'דוד שמש',
        'דוד חשמל',
        'צבע',
        'הדברה'
      ]
    ],
    ['shopping', ['לקנות', 'לרכוש', 'להזמין', 'סופר', 'קניות']],
    ['family', ['יום הולדת', 'מתנה', 'אירוע', 'חתונה', 'ברית']]
  ];

  const everyKeyword = keywords.flatMap(([id, words]) =>
    words.map((w): [CategoryId, string] => [id, w])
  );

  // council M5: a returns word needs a strong signal (here a clothing item) and "להזמין" a product
  const objectFor = (id: CategoryId, word: string): string =>
    id === 'returns' && word !== 'זיכוי' ? 'חולצה' : word === 'להזמין' ? 'ספה' : 'משהו';

  it.each(everyKeyword)('%s: %s', (id, word) => {
    const title = `${word} ${objectFor(id, word)}`;
    expect(fields(title)).toEqual({ title, categoryId: id });
  });

  it('conditional keywords need their context (M2): שמן, תור, דוד', () => {
    expect(fields('שמן משהו').categoryId).toBeUndefined();
    expect(fields('שמן מנוע').categoryId).toBe('car');
    expect(fields('תור משהו').categoryId).toBeUndefined();
    expect(fields('תור לבדיקה').categoryId).toBe('health');
    expect(fields('דוד משהו').categoryId).toBeUndefined();
    expect(fields('נזילה בדוד').categoryId).toBe('home');
  });

  it('keeps the keyword in the title and reports it as a "category" match', () => {
    const r = parse('לקחת את האוטו למוסך');
    expect(r.title).toBe('לקחת את האוטו למוסך');
    expect(r.matches).toMatchObject([{ kind: 'category', start: 8, end: 13, text: 'האוטו' }]);
  });

  it('accepts Hebrew prefixes on keywords', () => {
    for (const [word, id] of [
      ['ברכב', 'car'],
      ['לבנק', 'finance'],
      ['ובמרפאה', 'health'],
      ['מהמוסך', 'car'],
      ['לחשמלאי', 'home']
    ] as const) {
      expect(fields(`להתקשר ${word}`).categoryId).toBe(id);
    }
  });

  it('first category in table order wins, not the first word in the text', () => {
    expect(fields('להזמין תור לרופא').categoryId).toBe('health'); // health before shopping
    expect(fields('לקנות מתנה לדנה').categoryId).toBe('shopping'); // shopping before family
    expect(fields('מתנה לקנות').categoryId).toBe('shopping');
    expect(fields('לשלם תיקון לרכב').categoryId).toBe('car'); // car before finance and home
    // a returns verb is weak: a specific noun from another category wins (M2)
    expect(fields('להחזיר מצבר').categoryId).toBe('car');
    expect(fields('להחזיר חולצה').categoryId).toBe('returns'); // ...unless a store word backs it
    expect(fields('תיקון נזילה בדוד').categoryId).toBe('home');
    expect(fields('ביטוח רכב').categoryId).toBe('car');
    expect(fields('ביטוח').categoryId).toBe('finance');
    expect(fields('ביטוח לאומי').categoryId).toBe('finance');
  });

  it('matches whole words only', () => {
    expect(fields('ללכת למסעדה').categoryId).toBeUndefined(); // "מס" inside מסעדה
    expect(fields('לנסוע ברכבת').categoryId).toBeUndefined(); // רכבת is a train
    expect(fields('לקרוא על דודה').categoryId).toBeUndefined();
    expect(fields('לברר משהו').categoryId).toBeUndefined();
  });

  it('never moves a keyword out of the title, even when a date is consumed', () => {
    expect(fields('מחר לקחת את הרכב לטסט')).toEqual({
      title: 'לקחת את הרכב לטסט',
      scheduledFor: '2026-10-05',
      categoryId: 'car'
    });
  });
});

// ───────────────────────────── title tidy-up ─────────────────────────────

describe('title tidy-up', () => {
  it('collapses extra whitespace', () => {
    expect(fields('  לקנות    חלב   מחר  ')).toEqual({
      title: 'לקנות חלב',
      scheduledFor: '2026-10-05',
      categoryId: 'shopping'
    });
    expect(fields('  לברר \t על\n מזגן ').title).toBe('לברר על מזגן');
  });

  it('drops commas, dashes and colons orphaned by a removed phrase', () => {
    for (const input of [
      'מחר, לשלם ארנונה',
      'מחר - לשלם ארנונה',
      'מחר: לשלם ארנונה',
      'לשלם ארנונה, מחר',
      'לשלם ארנונה - מחר',
      'לשלם ארנונה – מחר',
      'לשלם ארנונה ,מחר',
      '- מחר - לשלם ארנונה -',
      'לשלם - מחר - ארנונה',
      'לשלם, מחר, ארנונה',
      'לשלם ארנונה (מחר)',
      'לשלם ארנונה (מחר).'
    ]) {
      expect(fields(input).title, input).toBe('לשלם ארנונה');
    }
  });

  it('trims edge punctuation even when nothing was removed', () => {
    expect(fields('  ,לקנות חלב.  ').title).toBe('לקנות חלב');
    expect(fields('- לקנות חלב -').title).toBe('לקנות חלב');
  });

  it('keeps meaningful punctuation: ?, quotes, parentheses, ellipsis-free decimals', () => {
    expect(fields('לברר מה עם הרכב?').title).toBe('לברר מה עם הרכב?');
    expect(fields('לקנות "חלב" (2 ליטר)').title).toBe('לקנות "חלב" (2 ליטר)');
    expect(fields('לקנות 2.5 קילו קמח').title).toBe('לקנות 2.5 קילו קמח');
  });

  it('removes a "עד" left hanging right before a removed phrase', () => {
    expect(fields('לשלם עד דחוף').title).toBe('לשלם');
    expect(fields('עד דחוף לשלם').title).toBe('לשלם');
    expect(fields('לשלם, עד !!').title).toBe('לשלם');
  });

  it('a prefix letter or hyphen before a date never dangles: it is consumed with the phrase', () => {
    for (const input of [
      'לשלם ארנונה ב-מחר',
      'לשלם ארנונה ב- מחר',
      'לשלם ארנונה ב - מחר',
      'לשלם ארנונה ב-15/10',
      'לשלם ארנונה ב 15/10',
      'לשלם ארנונה ל-15 באוקטובר',
      'לשלם ארנונה ב-',
      'לשלם ארנונה ב\u{5BE}',
      'ב- לשלם ארנונה',
      'ב- לשלם ארנונה מחר'
    ]) {
      expect(fields(input).title, input).toBe('לשלם ארנונה');
    }
  });

  it('never drops words the user typed, even "עד" or a letter such as the vitamin ב', () => {
    expect(fields('לקנות ויטמין ב').title).toBe('לקנות ויטמין ב');
    expect(fields('לקנות ויטמין ב!')).toEqual({
      title: 'לקנות ויטמין ב!',
      categoryId: 'shopping'
    });
    expect(fields('לחכות עד').title).toBe('לחכות עד');
    expect(fields('דחוף עד שהוא יחזור').title).toBe('עד שהוא יחזור');
    expect(fields('ב דחוף לקנות חלב').title).toBe('ב לקנות חלב');
  });

  it('keeps English, numbers and mixed-direction text intact', () => {
    expect(fields('לשלם 150 ₪ ל-Partner מחר').title).toBe('לשלם 150 ₪ ל-Partner');
    expect(fields('iPhone 15 Pro לקנות עד 15/10').title).toBe('iPhone 15 Pro לקנות');
    expect(fields('Netflix - לבטל מנוי עד סוף החודש').title).toBe('Netflix - לבטל מנוי');
    expect(fields('להתקשר ל-HOT מחר').title).toBe('להתקשר ל-HOT');
    expect(fields('Call mom tomorrow').title).toBe('Call mom tomorrow');
    // a number right after a Latin word is a model or version, not a date (C1a)
    expect(fields('WiFi 6E router 3/1').title).toBe('WiFi 6E router 3/1');
    expect(fields('WiFi 6E router ב-3/1').title).toBe('WiFi 6E router');
  });

  it('keeps niqqud and bidi marks that are not part of a match', () => {
    expect(fields('ל\u{5B0}ק\u{5B7}ח\u{5B7}ת רכב מחר').title).toBe('ל\u{5B0}ק\u{5B7}ח\u{5B7}ת רכב');
    expect(fields('\u{200F}לקנות חלב\u{200F} מחר').title).toBe('\u{200F}לקנות חלב\u{200F}');
  });

  it('falls back to the raw input when everything is consumed', () => {
    expect(fields('מחר')).toEqual({ title: 'מחר', scheduledFor: '2026-10-05' });
    expect(fields('  מחר  ').title).toBe('מחר');
    expect(fields('עד מחר').title).toBe('עד מחר');
    expect(fields('דחוף').title).toBe('דחוף');
    expect(fields('מחר בשעה 5 !!').title).toBe('מחר בשעה 5 !!');
    expect(fields('...').title).toBe('...');
    expect(fields('---').title).toBe('---');
  });

  it('empty or blank input gives an empty title and no matches', () => {
    expect(parse('')).toEqual({ title: '', matches: [] });
    expect(parse('   \n ')).toEqual({ title: '', matches: [] });
  });
});

// ───────────────────────────── several fields at once ─────────────────────────────

describe('multiple fields in one input', () => {
  it('urgent + due date + time + recurrence + category', () => {
    expect(fields('דחוף: לשלם ארנונה עד 15/10 בשעה 17:00 כל חודש')).toEqual({
      title: 'לשלם ארנונה',
      priority: 'urgent',
      dueDate: '2026-10-15',
      dueTime: '17:00',
      recurrence: { freq: 'monthly' },
      categoryId: 'finance'
    });
  });

  it('soft date + time + high priority + category', () => {
    expect(fields('מחר ב-17:30 לקחת את הילדים לרופא שיניים - חשוב')).toEqual({
      title: 'לקחת את הילדים לרופא שיניים',
      scheduledFor: '2026-10-05',
      dueTime: '17:30',
      priority: 'high',
      categoryId: 'health'
    });
  });

  it('returns keyword + "עד" + time + priority', () => {
    expect(fields('חשוב להחליף נעליים עד יום חמישי בשעה 5')).toEqual({
      title: 'להחליף נעליים',
      priority: 'high',
      dueDate: '2026-10-08',
      dueTime: '17:00',
      hardDeadline: true,
      categoryId: 'returns'
    });
  });

  it('takes only the first phrase per field and leaves the next one in the title', () => {
    expect(fields('לקנות חלב מחר ומחרתיים')).toEqual({
      title: 'לקנות חלב ומחרתיים',
      scheduledFor: '2026-10-05',
      categoryId: 'shopping'
    });
    expect(fields('פגישה ב-17:00 או ב-18:00').dueTime).toBe('17:00');
  });
});

// ───────────────────────────── no owner parsing ─────────────────────────────

const ALLOWED_KEYS = [
  'title',
  'matches',
  'scheduledFor',
  'dueDate',
  'dueTime',
  'hardDeadline',
  'priority',
  'categoryId',
  'recurrence'
];

describe('no owner/member parsing', () => {
  it('never produces an owner field, whatever the text says', () => {
    for (const input of [
      'דנה תקנה חלב מחר',
      'אמא לוקחת את הילדים',
      'אני אקח את האוטו למוסך',
      'לבקש מאבא לשלם ארנונה',
      '@דנה לקנות חלב'
    ]) {
      for (const key of Object.keys(parse(input))) {
        expect(ALLOWED_KEYS).toContain(key);
      }
    }
    expect(fields('דנה תקנה חלב מחר').title).toBe('דנה תקנה חלב');
  });

  it('omits fields that were not found (no undefined keys)', () => {
    expect(Object.keys(parse('לקנות חלב')).sort()).toEqual(['categoryId', 'matches', 'title']);
    expect(Object.keys(parse('בלה בלה')).sort()).toEqual(['matches', 'title']);
  });
});

// ───────────────────────────── matches[] offsets ─────────────────────────────

describe('matches: offsets into the ORIGINAL input', () => {
  it('reports kind/start/end/text for each recognised phrase, sorted by position', () => {
    const input = 'לקחת את האוטו למוסך מחר';
    const iCat = input.indexOf('האוטו');
    const iDate = input.indexOf('מחר');
    expect(parse(input).matches).toMatchObject([
      { kind: 'category', start: iCat, end: iCat + 'האוטו'.length, text: 'האוטו' },
      { kind: 'date', start: iDate, end: iDate + 3, text: 'מחר' }
    ]);
  });

  it('the "עד" phrase is one "due" match', () => {
    const input = 'להחזיר מכנסיים עד יום חמישי';
    const i = input.indexOf('עד');
    expect(parse(input).matches).toMatchObject([
      { kind: 'category', start: 0, end: 6, text: 'להחזיר' },
      { kind: 'due', start: i, end: input.length, text: 'עד יום חמישי' }
    ]);
  });

  it('reports every kind', () => {
    const input = 'דחוף! לשלם ארנונה עד 15/10 בשעה 17:30 כל חודש';
    const kinds = parse(input).matches.map((m) => [m.kind, m.text]);
    expect(kinds).toEqual([
      ['priority', 'דחוף!'],
      ['category', 'לשלם'],
      ['due', 'עד 15/10'],
      ['time', 'בשעה 17:30'],
      ['recurrence', 'כל חודש']
    ]);
  });

  it('survives extra whitespace, hyphens and prefixes in the original text', () => {
    const input = '  לקנות   חלב    ב-מחר   ';
    const [first] = parse(input).matches.filter((m) => m.kind === 'date');
    expect(first?.text).toBe('ב-מחר');
    expect(first?.start).toBe(input.indexOf('ב-מחר'));

    const spaced = 'להתקשר    מחר     בשעה    5';
    const time = parse(spaced).matches.find((m) => m.kind === 'time');
    expect(time?.text).toBe('בשעה    5');
    expect(spaced.slice(time?.start, time?.end)).toBe('בשעה    5');

    const maqaf = 'לשלם ב\u{5BE}15/10';
    expect(parse(maqaf).matches.find((m) => m.kind === 'date')?.text).toBe('ב\u{5BE}15/10');
  });

  it('maps offsets through niqqud, so the span includes the diacritics', () => {
    const input = 'לנקות ב\u{5B0}\u{5BC}יו\u{5B9}ם ש\u{5B7}\u{5C1}ב\u{5B8}\u{5BC}ת';
    const r = parse(input);
    expect(r.scheduledFor).toBe('2026-10-10');
    expect(r.title).toBe('לנקות');
    const m = r.matches[0];
    expect(m?.text).toBe('ב\u{5B0}\u{5BC}יו\u{5B9}ם ש\u{5B7}\u{5C1}ב\u{5B8}\u{5BC}ת');
    expect(m?.start).toBe(input.indexOf('ב\u{5B0}\u{5BC}'));
    expect(m?.end).toBe(input.length);
  });

  it('counts UTF-16 units, so emoji before a match shift the offsets correctly', () => {
    const input = '🛒 לקנות חלב 🥛 מחר';
    const r = parse(input);
    const date = r.matches.find((m) => m.kind === 'date');
    expect(date?.start).toBe(input.indexOf('מחר'));
    expect(date?.text).toBe('מחר');
    expect(r.title).toBe('🛒 לקנות חלב 🥛');
  });

  it('handles decomposed and precomposed input alike', () => {
    // U+FB2A is "ש\u{5C1}" (shin + shin dot) as one presentation-form character
    const input = 'לנקות ביום \u{FB2A}בת';
    const r = parse(input);
    expect(r.scheduledFor).toBe('2026-10-10');
    expect(input.slice(r.matches[0]?.start, r.matches[0]?.end)).toBe('ביום \u{FB2A}בת');
  });

  it('every match slices back to its own text, in every required case', () => {
    for (const [input] of REQUIRED_INPUTS) {
      const r = parse(input);
      for (const m of r.matches) {
        expect(input.slice(m.start, m.end), input).toBe(m.text);
        expect(m.end).toBeGreaterThan(m.start);
      }
      const sorted = [...r.matches].sort((a, b) => a.start - b.start);
      expect(r.matches).toEqual(sorted);
    }
  });
});

const REQUIRED_INPUTS: [string][] = [
  ['לקחת את האוטו למוסך מחר'],
  ['להחזיר מכנסיים עד יום חמישי'],
  ['דחוף לשלם ארנונה'],
  ['תור לרופא שיניים בשבוע הבא'],
  ['לקנות מתנה לדנה עד 15/10'],
  ['לברר על מזגן'],
  ['השבוע לתקן את הברז'],
  ['להשקות עציצים כל שבוע'],
  ['חשמלאי ביום ראשון בשעה 17:30'],
  ['פגישה בבנק 3/1'],
  ['31/02 משהו'],
  ['מחר'],
  ['Netflix לבטל מנוי עד סוף החודש'],
  ['ביום שבת לנקות את המחסן'],
  ['בעוד שבועיים טסט לרכב'],
  ['דחוף: לשלם ארנונה עד 15/10 בשעה 17:00 כל חודש'],
  ['מחר ב-17:30 לקחת את הילדים לרופא שיניים !'],
  ['  לקנות   חלב    ב-מחר   ']
];

// ───────────────────────────── deletePhraseFromInput / rebuildTitle ─────────────────────────────

describe('deletePhraseFromInput (deprecated alias: removeMatch)', () => {
  it('removes the phrase and tidies what is left', () => {
    const cases: [string, MatchKindName, string][] = [
      ['לקחת את האוטו למוסך מחר', 'date', 'לקחת את האוטו למוסך'],
      ['דחוף לשלם ארנונה', 'priority', 'לשלם ארנונה'],
      ['חשמלאי ביום ראשון בשעה 17:30', 'time', 'חשמלאי ביום ראשון'],
      ['חשמלאי ביום ראשון בשעה 17:30', 'date', 'חשמלאי בשעה 17:30'],
      ['להחזיר מכנסיים עד יום חמישי', 'due', 'להחזיר מכנסיים'],
      ['להשקות עציצים כל שבוע', 'recurrence', 'להשקות עציצים'],
      ['מחר, לשלם ארנונה', 'date', 'לשלם ארנונה'],
      ['לשלם - מחר - ארנונה', 'date', 'לשלם ארנונה'],
      ['  לקנות   חלב    ב-מחר   ', 'date', 'לקנות חלב']
    ];
    for (const [input, kind, expected] of cases) {
      const m = parse(input).matches.find((x) => x.kind === kind);
      expect(m, `${input} / ${kind}`).toBeDefined();
      if (m) expect(deletePhraseFromInput(input, m)).toBe(expected);
    }
  });

  it('removing a category match deletes the keyword text itself', () => {
    const input = 'לקחת את האוטו למוסך מחר';
    const m = parse(input).matches.find((x) => x.kind === 'category');
    expect(m).toBeDefined();
    if (m) expect(deletePhraseFromInput(input, m)).toBe('לקחת את למוסך מחר');
  });

  it('round-trips: re-parsing the result drops exactly that chip and keeps the others', () => {
    let checked = 0;
    for (const [input] of REQUIRED_INPUTS) {
      const before = parse(input);
      for (const m of before.matches) {
        const after = parse(deletePhraseFromInput(input, m));
        const keys = after.matches.map((x) => x.key);
        // the deleted chip is gone...
        expect(keys, `${input} minus ${m.key}`).not.toContain(m.key);
        // ...and every other chip survives with the SAME key, although its offsets moved
        // (a category keyword is only one of possibly several, so the category may switch keyword)
        for (const other of before.matches) {
          if (other !== m && other.kind !== 'category' && m.kind !== 'category') {
            expect(keys, `${input} minus ${m.key}`).toContain(other.key);
          }
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(25);
  });

  it('drops hardDeadline together with the "עד" phrase', () => {
    const input = 'להחזיר מכנסיים עד יום חמישי';
    const due = parse(input).matches.find((m) => m.kind === 'due');
    expect(due).toBeDefined();
    if (due) {
      const after = parse(deletePhraseFromInput(input, due));
      expect(after.hardDeadline).toBeUndefined();
      expect(after.dueDate).toBeUndefined();
      expect(after.categoryId).toBe('returns');
    }
  });

  it('locates a stale match by its text, and degrades to a plain tidy when it is gone', () => {
    expect(removeMatch).toBe(deletePhraseFromInput);
    expect(removeMatch('לקנות חלב מחר', { start: 0, end: 3, text: 'מחר' })).toBe('לקנות חלב');
    expect(removeMatch('  לקנות חלב  ', { start: 0, end: 3, text: 'מחר' })).toBe('לקנות חלב');
    expect(removeMatch('לקנות חלב', { start: 3, end: 3, text: '' })).toBe('לקנות חלב');
    expect(removeMatch('לקנות חלב', { start: 0, end: 3, text: '' })).toBe('לקנות חלב');
    expect(removeMatch('לקנות חלב', { start: -5, end: 99, text: 'x' })).toBe('לקנות חלב');
  });

  it('can return an empty string when the match was the whole input', () => {
    const m = parse('מחר').matches[0];
    expect(m).toBeDefined();
    if (m) expect(deletePhraseFromInput('מחר', m)).toBe('');
  });
});

describe('rebuildTitle', () => {
  it('puts a dismissed phrase back into the title', () => {
    const input = 'לקחת את האוטו למוסך מחר';
    const r = parse(input);
    expect(rebuildTitle(input, r.matches)).toBe(r.title);
    expect(
      rebuildTitle(
        input,
        r.matches.filter((m) => m.kind !== 'date')
      )
    ).toBe('לקחת את האוטו למוסך מחר');
    expect(rebuildTitle(input, [])).toBe('לקחת את האוטו למוסך מחר');
  });

  it('keeps tidy spacing around the phrases that stay consumed', () => {
    const input = 'דחוף: לשלם ארנונה עד 15/10 בשעה 17:00';
    const r = parse(input);
    const withoutTime = r.matches.filter((m) => m.kind !== 'time');
    expect(rebuildTitle(input, withoutTime)).toBe('לשלם ארנונה בשעה 17:00');
  });

  it('falls back to the raw input when nothing is left', () => {
    const r = parse('מחר');
    expect(rebuildTitle('מחר', r.matches)).toBe('מחר');
  });
});

// ───────────────────────────── robustness ─────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

const HEBREW = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת';
const NIQQUD = ['\u{5B0}', '\u{5B4}', '\u{5B7}', '\u{5BC}', '\u{5C1}', '\u{5C2}'];
const PUNCT = [...'/.:-!?\'"\u{5F3}\u{5F4}\u{2019}\u{201D},;()\u{5BE}–'];
const ODD = [
  '\u{200F}',
  '\u{200E}',
  '\uD800',
  '\uDC00',
  '🛒',
  '🥛',
  '\u{FB2A}',
  '\u{A0}',
  '\n',
  '\t',
  '₪'
];
const VOCAB = [
  'מחר',
  'היום',
  'מחרתיים',
  'עד',
  'ב',
  'ו',
  'בשעה',
  'שעה',
  '5',
  '17:30',
  '17.30',
  '15/10',
  '3.1',
  '31/02',
  '29/2',
  '15/10/2027',
  'ביום',
  'יום',
  "ה'",
  'שבת',
  'ראשון',
  'השבוע',
  'סוף',
  'סופ"ש',
  'החודש',
  'הבא',
  'שבוע',
  'חודש',
  'בעוד',
  'שבועיים',
  'יומיים',
  '3',
  '999',
  '1000',
  'ימים',
  '!',
  '!!',
  'דחוף',
  'חשוב',
  'לא',
  'כל',
  'פעם',
  'לשלם',
  'ארנונה',
  'להחזיר',
  'רכב',
  'מוסך',
  'תור',
  'באוקטובר',
  '15',
  'מועד',
  'אחרון',
  'Netflix',
  'iPhone',
  'ל',
  'ה-',
  'ב-'
];

function randomInput(rng: () => number): string {
  if (rng() < 0.5) {
    const n = Math.floor(rng() * 9);
    let s = '';
    for (let i = 0; i < n; i++) {
      s += pick(rng, VOCAB) + pick(rng, ['', ' ', ' ', '  ', '-', ', ', ' - ', '\u{200F}']);
    }
    return s;
  }
  const length = Math.floor(rng() * 60);
  let s = '';
  for (let i = 0; i < length; i++) {
    const r = rng();
    if (r < 0.35) s += HEBREW.charAt(Math.floor(rng() * HEBREW.length));
    else if (r < 0.42) s += pick(rng, NIQQUD);
    else if (r < 0.57) s += String.fromCharCode(97 + Math.floor(rng() * 26));
    else if (r < 0.7) s += String(Math.floor(rng() * 10));
    else if (r < 0.82) s += pick(rng, PUNCT);
    else if (r < 0.92) s += ' ';
    else s += pick(rng, ODD);
  }
  return s;
}

function assertSane(input: string, r: ParseResult): void {
  const fail = (why: string): never => {
    throw new Error(`${why} for ${JSON.stringify(input)} => ${JSON.stringify(r)}`);
  };
  if (typeof r.title !== 'string') fail('title is not a string');
  if (input.trim() !== '' && r.title === '') fail('empty title');
  if (r.title !== r.title.trim()) fail('untrimmed title');
  let lastStart = -1;
  const consumed: [number, number][] = [];
  for (const m of r.matches) {
    if (!(m.start >= 0 && m.end > m.start && m.end <= input.length)) fail('bad offsets');
    if (input.slice(m.start, m.end) !== m.text) fail('text does not match offsets');
    if (m.start < lastStart) fail('matches not sorted');
    lastStart = m.start;
    if (m.kind !== 'category') {
      if (consumed.some(([s, e]) => m.start < e && s < m.end)) fail('overlapping matches');
      consumed.push([m.start, m.end]);
    }
  }
  for (const iso of [r.scheduledFor, r.dueDate]) {
    if (iso !== undefined && !isValidISO(iso)) fail('invalid date');
  }
  if (r.dueTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.dueTime)) fail('invalid time');
  if (r.hardDeadline !== undefined && r.hardDeadline !== true)
    fail('hardDeadline must be true or absent');
  for (const [key, value] of Object.entries(r)) if (value === undefined) fail(`undefined ${key}`);
}

describe('robustness', () => {
  it('never throws, always keeps a non-empty title, and reports sane matches (fuzz)', () => {
    const rng = mulberry32(20261004);
    for (let i = 0; i < 4000; i++) {
      const input = randomInput(rng);
      const r = parseQuickAdd(input, NOW);
      assertSane(input, r);
      // the chip operations must not throw either, and must stay sane
      for (const m of r.matches) {
        const without = deletePhraseFromInput(input, m);
        assertSane(without, parseQuickAdd(without, NOW));
      }
      rebuildTitle(input, r.matches.slice(1));
    }
  });

  it('is deterministic', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const input = randomInput(rng);
      expect(parseQuickAdd(input, NOW)).toEqual(parseQuickAdd(input, NOW));
    }
  });

  it('survives hostile single inputs', () => {
    const hostile = [
      '',
      ' ',
      '\u0000',
      '\uD800',
      '\uDC00',
      'מחר\uD83D',
      '\u{5B0}\u{5B0}\u{5B0}',
      '!'.repeat(500),
      '-'.repeat(500),
      '/'.repeat(500),
      '1/'.repeat(300),
      'ב'.repeat(300),
      'ובלמשכה'.repeat(50),
      'עד '.repeat(150),
      ('מחר ' + '15/10 ' + 'בשעה 5 ' + '!! ').repeat(40),
      'בעוד '.repeat(100),
      '\u{200F}'.repeat(300)
    ];
    for (const input of hostile) assertSane(input, parseQuickAdd(input, NOW));
  });

  it('copes with a non-string input, an invalid Date and a bad timezone', () => {
    expect(parseQuickAdd(undefined as unknown as string, NOW)).toEqual({ title: '', matches: [] });
    expect(parseQuickAdd(null as unknown as string, NOW).title).toBe('');
    expect(parseQuickAdd(42 as unknown as string, NOW).title).toBe('');
    expect(parseQuickAdd('לקנות חלב מחר', new Date(NaN)).scheduledFor).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(parseQuickAdd('לקנות חלב מחר', NOW, 'Not/AZone').scheduledFor).toBe('2026-10-05');
  });

  it('stays fast on 300-character inputs and scales roughly linearly', () => {
    const inputs = [
      'ובלמשכה'.repeat(43),
      'א'.repeat(300),
      '1/'.repeat(150),
      'עד '.repeat(100),
      'בעוד '.repeat(60),
      "מחר 15/10 בשעה 5 !! דחוף עד יום ה' כל שבוע לשלם ".repeat(8).slice(0, 300),
      'לקנות חלב ביצים ולחם ו'.repeat(14).slice(0, 300)
    ];
    for (const s of inputs) parseQuickAdd(s, NOW); // warm up
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) for (const s of inputs) parseQuickAdd(s, NOW);
    const perParse = (performance.now() - t0) / (20 * inputs.length);
    expect(perParse).toBeLessThan(15);

    const long = "מחר 15/10 בשעה 5 !! דחוף עד יום ה' כל שבוע לשלם ".repeat(60); // ~3000 chars
    const t1 = performance.now();
    parseQuickAdd(long, NOW);
    expect(performance.now() - t1).toBeLessThan(500);
  });
});

type MatchKindName = ParseResult['matches'][number]['kind'];
