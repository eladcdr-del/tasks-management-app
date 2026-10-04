// Round-2 precision fixes for the quick-add parser (step 1.3 QA, items C1-C4, M1-M4, M6, decisions
// (b)-(d) and the minors). The governing rule: a wrong chip is worse than no chip.
import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type ParseResult } from './quickAdd';

/** Sunday 2026-10-04, 09:00 in Asia/Jerusalem (IDT, UTC+3). */
const NOW = new Date('2026-10-04T06:00:00Z');
/** Thursday 2026-10-08 09:00, Friday 10-09 09:00, Saturday 10-10 09:00 and 22:30 (Jerusalem). */
const THU = new Date('2026-10-08T06:00:00Z');
const FRI = new Date('2026-10-09T06:00:00Z');
const SAT = new Date('2026-10-10T06:00:00Z');
const SAT_LATE = new Date('2026-10-10T19:30:00Z');

const parse = (input: string, now: Date = NOW): ParseResult => parseQuickAdd(input, now);
const fields = (input: string, now: Date = NOW): Omit<ParseResult, 'matches'> => {
  const { matches: _matches, ...rest } = parse(input, now);
  return rest;
};

/** The input produced no date of any kind and its title is untouched. */
function expectNoDate(input: string): void {
  const r = parse(input);
  expect(r.scheduledFor, input).toBeUndefined();
  expect(r.dueDate, input).toBeUndefined();
  expect(r.title, input).toBe(input);
}

// ───────────────────────────── C1: numbers that are not dates ─────────────────────────────

describe('C1: an un-introduced number that is not a date', () => {
  it.each([
    'להעביר 1.5 אלף לוועד',
    'לאסוף חבילה מהרצל 15/3',
    'דירה 4/12 לבדוק נזילה',
    'להחליף חולצה למידה 10/12',
    'לעדכן ל-iOS 17.1',
    'ציון 9/10 במבחן',
    'לשלם 1/3 מהסכום',
    'לבדוק 2.5'
  ])('%s', (input) => expectNoDate(input));

  it('(a) a context word just before it, with or without prefixes', () => {
    for (const input of [
      'רחוב 4/12 לבדוק',
      'לבקר בדירה 4/12',
      'קומה 3/10',
      'בניין 5/10 כניסה ב',
      'כניסה 5/10',
      'סניף 12/10',
      'גרסה 10/10',
      'מספר 5/10',
      'מס׳ 5/10',
      "רח' 5/10",
      'Partner 15/10 לברר',
      'WiFi 6E router 3/1'
    ]) {
      expectNoDate(input);
    }
    // a plain "מס" (tax) is not the abbreviation "מס׳"
    expect(fields('לשלם מס 15/10').scheduledFor).toBe('2026-10-15');
  });

  it('(a) a street word up to three words back', () => {
    expectNoDate('לאסוף חבילה ברחוב הרצל 15/10');
    expectNoDate('רחוב בן גוריון 4/12');
  });

  it('(b) a fraction x/y with x < y ≤ 4', () => {
    for (const input of ['לאכול 1/2 מהעוגה', 'לשלם 2/3 מהחוב', 'למלא 3/4 מהמיכל', 'לגזור 1/4'])
      expectNoDate(input);
    // 5/10 is not a fraction under the rule, and an introduced 1/3 is a date
    expect(fields('לבדוק 5/10').scheduledFor).toBe('2026-10-05');
    expect(fields('לשלם ב-1/3').scheduledFor).toBe('2027-03-01');
  });

  it('(c) dot notation n.d with n ≤ 9 and a single-digit second part', () => {
    for (const input of ['לבדוק 1.5', 'לבדוק 3.5', 'משקל 2.5', 'לבדוק 3.1']) expectNoDate(input);
    expect(fields('לבדוק 03.01').scheduledFor).toBe('2027-01-03');
    expect(fields('לבדוק ב-3.1').scheduledFor).toBe('2027-01-03');
    expect(fields('לבדוק 15.10').scheduledFor).toBe('2026-10-15');
  });

  it('(d) a magnitude or unit word after it', () => {
    for (const input of [
      'להעביר 2.5 מיליון',
      'להעביר 1.5 מליון',
      'מכרז 3/4 מיליארד',
      'ריבית 3/4 אחוז',
      'לקנות 1/2 קילו גבינה',
      'לשלם 10.5 דולר'
    ])
      expectNoDate(input);
  });

  it('(e) a year-less date more than 120 days ahead, unless introduced', () => {
    expectNoDate('לבדוק 15/3');
    expectNoDate('לבדוק 10.5');
    expect(fields('פגישה בבנק 3/1').scheduledFor).toBe('2027-01-03'); // 91 days: still a date
    expect(fields('לבדוק 1/2').scheduledFor).toBeUndefined(); // also a fraction
    expect(fields('לבדוק ב-15/3')).toEqual({ title: 'לבדוק', scheduledFor: '2027-03-15' });
    expect(fields('לבדוק בתאריך 15/3')).toEqual({ title: 'לבדוק', scheduledFor: '2027-03-15' });
    expect(fields('לבדוק עד 15/3')).toEqual({ title: 'לבדוק', dueDate: '2027-03-15' });
    // an explicit year is always a date
    expect(fields('לבדוק 15/3/2027')).toEqual({ title: 'לבדוק', scheduledFor: '2027-03-15' });
  });
});

// ───────────────────────────── C2: ב + a bare weekday name ─────────────────────────────

describe('C2: ב + a bare weekday name', () => {
  it.each([
    'לאסוף חבילה בראשון לציון',
    'בראשון לחודש לשלם שכר דירה',
    'לשלם בשני תשלומים',
    'לטפל בשני הילדים',
    // ("בשני לקנות חלב" IS Monday since the Phase 1 council: a leading weekday before an infinitive)
    'לחלק בשלישי מהכסף'
  ])('"%s" has no weekday and keeps its title', (input) => {
    const r = parse(input);
    expect(r.scheduledFor).toBeUndefined();
    expect(r.dueDate).toBeUndefined();
    expect(r.title).toBe(input);
  });

  it('is a weekday at the end, before punctuation, a time or date phrase, or a modifier', () => {
    expect(fields('להתקשר לחשמלאי בשני')).toEqual({
      title: 'להתקשר לחשמלאי',
      scheduledFor: '2026-10-05',
      categoryId: 'home'
    });
    expect(fields('להתקשר בשני, לא לשכוח').scheduledFor).toBe('2026-10-05');
    expect(fields('להתקשר בשני - לא לשכוח').scheduledFor).toBe('2026-10-05');
    expect(fields('להתקשר בשני בשעה 10')).toEqual({
      title: 'להתקשר',
      scheduledFor: '2026-10-05',
      dueTime: '10:00'
    });
    expect(fields('להתקשר בשני בבוקר')).toEqual({ title: 'להתקשר', scheduledFor: '2026-10-05' });
    expect(fields('להתקשר בשני הקרוב')).toEqual({ title: 'להתקשר', scheduledFor: '2026-10-05' });
    expect(fields('להתקשר בשבת הבאה')).toEqual({ title: 'להתקשר', scheduledFor: '2026-10-10' });
    expect(fields('להתקשר בשני!!')).toEqual({
      title: 'להתקשר',
      scheduledFor: '2026-10-05',
      priority: 'high' // "!!" is at most high (Phase 1 council)
    });
  });

  it('"עד" + a bare day name followed by a definite or plural noun is not a weekday', () => {
    expect(fields('לחכות עד שני הילדים יחזרו').dueDate).toBeUndefined();
    expect(fields('לנסוע עד ראשון לציון').dueDate).toBeUndefined();
    expect(fields('לסדר עד חמישי').dueDate).toBe('2026-10-08');
  });
});

// ───────────────────────────── C3: composite phrases ─────────────────────────────

describe('C3: composite phrases (now = Sunday 2026-10-04)', () => {
  it.each([
    ['ביום שלישי בשבוע הבא לקבוע תור', 'לקבוע תור', '2026-10-13'],
    ['בשבוע הבא ביום שלישי', 'בשבוע הבא ביום שלישי', '2026-10-13'],
    ['לקבוע תור בשבוע הבא ביום ג׳', 'לקבוע תור', '2026-10-13'],
    ['לקבוע תור ביום ראשון שבוע הבא', 'לקבוע תור', '2026-10-11'],
    ['לקבוע תור בשבת בשבוע הבא', 'לקבוע תור', '2026-10-17'],
    ['בסוף החודש הבא לשלם', 'לשלם', '2026-11-30'],
    ['בתחילת החודש הבא לשלם', 'לשלם', '2026-11-01'],
    ['לנקות בסוף השבוע הבא', 'לנקות', '2026-10-16'],
    ['לנקות בתחילת השבוע הבא', 'לנקות', '2026-10-11'],
    ['לנקות ביום ראשון הבא', 'לנקות', '2026-10-11'],
    ['לנקות ביום שלישי הבא', 'לנקות', '2026-10-06'],
    ['לנקות ביום חמישי השבוע', 'לנקות', '2026-10-08'],
    ['לנקות בסוף היום', 'לנקות', '2026-10-04']
  ])('%s', (input, title, scheduledFor) => {
    const r = fields(input);
    expect(r.scheduledFor).toBe(scheduledFor);
    // the all-consumed case falls back to the raw input
    expect(r.title).toBe(title);
  });

  it('"עד סוף היום" is a due date today', () => {
    expect(fields('עד סוף היום לשלוח טופס')).toEqual({
      title: 'לשלוח טופס',
      dueDate: '2026-10-04',
      categoryId: 'finance'
    });
  });

  it('"עד" works with every composite', () => {
    expect(fields('לשלם עד סוף החודש הבא')).toEqual({
      title: 'לשלם',
      dueDate: '2026-11-30',
      categoryId: 'finance'
    });
    expect(fields('לסדר עד יום שלישי בשבוע הבא')).toEqual({ title: 'לסדר', dueDate: '2026-10-13' });
  });

  it('a period word after a modifier that no composite matched is not a date', () => {
    for (const input of [
      'לשלוח סדר היום לוועד',
      'פרשת השבוע לקרוא',
      'להיפגש באמצע השבוע',
      'להיפגש באמצע השבוע הבא',
      'להיפגש באמצע החודש הבא',
      'לעבוד כל היום',
      'להתאמן כל השבוע',
      'לסדר בתחילת השבוע'
    ]) {
      expectNoDate(input);
    }
  });

  it('a weekday composite resolves relative to Saturday too', () => {
    expect(fields('לקבוע ביום שלישי בשבוע הבא', SAT).scheduledFor).toBe('2026-10-13');
    expect(fields('לקבוע ביום שלישי השבוע', SAT).scheduledFor).toBe('2026-10-13');
    expect(fields('לקבוע ביום שני השבוע', THU).scheduledFor).toBe('2026-10-12');
  });
});

// ───────────────────────────── C4: times ─────────────────────────────

describe('C4: times', () => {
  it.each([
    ['טיסה בשעה 6 בבוקר', 'טיסה', '06:00', '2026-10-05'],
    ['פגישה בבנק בשעה 8 בערב', 'פגישה בבנק', '20:00', '2026-10-04'],
    ['אסיפת הורים בשעה 5:30', 'אסיפת הורים', '17:30', '2026-10-04'],
    ['תור לרופא שיניים ב-8 בבוקר', 'תור לרופא שיניים', '08:00', '2026-10-05'],
    ['להתקשר בין 10:00 ל-12:00', 'להתקשר', '10:00', '2026-10-04']
  ])('%s', (input, title, dueTime, scheduledFor) => {
    const r = fields(input);
    expect(r.title).toBe(title);
    expect(r.dueTime).toBe(dueTime);
    expect(r.scheduledFor).toBe(scheduledFor);
  });

  it.each([
    ['בשעה 3 בלילה', '03:00'],
    ['בשעה 11 בלילה', '23:00'],
    ['בשעה 12 בלילה', '00:00'],
    ['בשעה 1 בצהריים', '13:00'],
    ['בשעה 12 בצהריים', '12:00'],
    ['בשעה 2 בצהריים', '14:00'],
    ['בשעה 4 אחה״צ', '16:00'],
    ['בשעה 4 אחה"צ', '16:00'],
    ['בשעה 4 אחרי הצהריים', '16:00'],
    ['בשעה 4 אחר הצהריים', '16:00'],
    ['ב-5 לפנות בוקר', '05:00'],
    ['ב-7 בבוקר', '07:00'],
    ['ב8 בערב', '20:00'],
    ['בשעה 7:30 בבוקר', '07:30'],
    ['בשעה 08:00 בערב', '20:00'],
    ['בשעה 17:00 בערב', '17:00'],
    ['5:30', '17:30'],
    ['4:15', '16:15'],
    ['ב-4:15', '16:15'],
    ['05:30', '05:30'],
    ['בשעה 5.30', '17:30'],
    ['בשעה 5 וחצי', '17:30'],
    ['בשעה 9 ורבע', '09:15'],
    ['בין 10 ל-12', '10:00'],
    ['בין 2 ל-4', '14:00'],
    ['בין 4 ל-6 אחה״צ', '16:00'],
    ['בין השעות 10 ל-12', '10:00'],
    ['10:00-12:00', '10:00'],
    ['מ-10:00 עד 12:00', '10:00'],
    ['בבוקר בשעה 7', '07:00'],
    ['בערב בשעה 8', '20:00']
  ])('%s → %s, and the whole phrase leaves the title', (phrase, dueTime) => {
    const r = fields(`להתקשר ${phrase}`);
    expect(r.dueTime).toBe(dueTime);
    expect(r.title).toBe('להתקשר');
  });

  it('"ב-N" without a part-of-day word is not a time, and a range needs a clean ending', () => {
    expect(fields('לקנות ב-5').dueTime).toBeUndefined();
    expect(fields('לחלק בין 2 ל-3 ילדים')).toEqual({ title: 'לחלק בין 2 ל-3 ילדים' });
  });

  it('a part-of-day word next to a date (and no time) is consumed, no time is set', () => {
    expect(fields('להתקשר מחר בבוקר')).toEqual({ title: 'להתקשר', scheduledFor: '2026-10-05' });
    expect(fields('להתקשר היום בערב')).toEqual({ title: 'להתקשר', scheduledFor: '2026-10-04' });
    expect(fields('להתקשר ביום חמישי בצהריים')).toEqual({
      title: 'להתקשר',
      scheduledFor: '2026-10-08'
    });
    expect(fields('להתקשר בערב').title).toBe('להתקשר בערב'); // no date: nothing to attach to
  });

  it('the part of day on a date steers the time that goes with it', () => {
    expect(fields('להתקשר מחר בבוקר בשעה 7')).toEqual({
      title: 'להתקשר',
      scheduledFor: '2026-10-05',
      dueTime: '07:00'
    });
    expect(fields('להתקשר מחר בערב בשעה 8')).toEqual({
      title: 'להתקשר',
      scheduledFor: '2026-10-05',
      dueTime: '20:00'
    });
  });

  it('a score, a ratio or a duration is not a time', () => {
    for (const input of ['ניצחנו 3:10', 'תוצאה 2:15 למכבי', 'להתאמן 1:30 שעות', 'יחס 1:10']) {
      const r = parse(input);
      expect(r.dueTime, input).toBeUndefined();
      expect(r.title, input).toBe(input);
    }
  });
});

// ───────────────────────────── M1: השבוע and the week horizon ─────────────────────────────

describe('M1: "השבוע" is weekHorizon(today)', () => {
  it.each([
    ['Sunday', NOW, '2026-10-10'],
    ['Thursday', THU, '2026-10-10'],
    ['Friday', FRI, '2026-10-17'],
    ['Saturday', SAT, '2026-10-17'],
    ['Saturday 22:30', SAT_LATE, '2026-10-17']
  ])('%s', (_day, now, iso) => {
    expect(fields('להתקשר השבוע', now)).toEqual({
      title: 'להתקשר',
      scheduledFor: iso,
      weekPlan: true
    });
  });

  it('decision (f): "סוף השבוע" said on Friday is today; on Saturday it is next Friday', () => {
    expect(fields('להתקשר בסוף השבוע', FRI).scheduledFor).toBe('2026-10-09');
    expect(fields('להתקשר בסוף השבוע', SAT).scheduledFor).toBe('2026-10-16');
  });
});

// ───────────────────────────── M2: strong and weak category keywords ─────────────────────────────

describe('M2: strong and weak category keywords', () => {
  it.each([
    ['להחליף מצבר עד יום חמישי', { categoryId: 'car', dueDate: '2026-10-08' }],
    ['להחליף נורה עד מחר', { categoryId: 'home', dueDate: '2026-10-05' }],
    ['לקנות שמן זית', { categoryId: 'shopping' }],
    ['לקנות שמלה בצבע אדום', { categoryId: 'shopping' }],
    ['להתקשר לדוד משה', {}],
    ['לקנות מחשבון', { categoryId: 'shopping' }],
    ['תור לספר', {}],
    ['תור למספרה', {}],
    ['תור לרופאה', { categoryId: 'health' }],
    ['להחליף שמן', { categoryId: 'car' }],
    ['החלפת שמן מנוע', { categoryId: 'car' }],
    ['לשמן את הדלת', {}],
    ['לצבוע בצבע לבן', {}],
    ['לקנות צבע לקיר', { categoryId: 'home' }],
    ['לתקן את דוד השמש', { categoryId: 'home' }],
    ['דוד חשמל', { categoryId: 'home' }],
    ['להחזיר ספר לספרייה', {}], // council M5: returns needs a strong signal
    ['להחליף מתנה', { categoryId: 'returns' }],
    ['להחזיר טופס לבנק', { categoryId: 'finance' }],
    ['דירה מס׳ 4', {}],
    ['מסופר שהיה שם', {}],
    ['לקנות לחם מהסופר', { categoryId: 'shopping' }],
    ['מנורה חדשה לסלון', {}],
    ['לנסוע לארצות הברית', {}],
    ['ברית מילה לנכד', { categoryId: 'family' }]
  ] as [string, Partial<ParseResult>][])('%s', (input, expected) => {
    const r = fields(input);
    expect(r.categoryId).toBe(expected.categoryId);
    if (expected.dueDate) expect(r.dueDate).toBe(expected.dueDate);
    expect(r.hardDeadline).toBeUndefined();
  });

  it('hardDeadline from returns + "עד" needs a strong returns signal', () => {
    expect(fields('להחזיר חולצה לזארה עד יום חמישי')).toEqual({
      title: 'להחזיר חולצה לזארה',
      dueDate: '2026-10-08',
      hardDeadline: true,
      categoryId: 'returns'
    });
    expect(fields('להחזיר ספר לספרייה עד יום חמישי')).toEqual({
      title: 'להחזיר ספר לספרייה',
      dueDate: '2026-10-08'
    });
    expect(fields('להחליף מצבר בחנות עד מחר').hardDeadline).toBe(true); // store word: strong
    expect(fields('לקבל זיכוי עד 15/10').hardDeadline).toBe(true);
  });
});

// ───────────────────────────── M3: leftover words ─────────────────────────────

describe('M3: no leftover words in the title', () => {
  it.each([
    ['חשוב מאוד לברר על הביטוח', 'לברר על הביטוח', 'high'],
    ['לשלם חשבון חשמל - דחוף מאוד', 'לשלם חשבון חשמל', 'urgent'],
    ['זה חשוב! לשלם ביטוח לאומי', 'לשלם ביטוח לאומי', 'high'],
    ['ממש דחוף לקנות חלב', 'לקנות חלב', 'urgent'],
    ['הכי חשוב לסדר', 'לסדר', 'high'],
    ['סופר דחוף לקנות חלב', 'לקנות חלב', 'urgent'],
    ['חשוב לי לברר', 'לברר', 'high'],
    ['דחוף ביותר: לשלם', 'לשלם', 'urgent'],
    ['זה ממש חשוב לסדר', 'לסדר', 'high']
  ])('%s', (input, title, priority) => {
    const r = fields(input);
    expect(r.title).toBe(title);
    expect(r.priority).toBe(priority);
  });

  it('a negation still reaches past the intensifiers', () => {
    expect(fields('לא ממש דחוף לקנות חלב').priority).toBeUndefined();
    expect(fields('לא כל כך חשוב לסדר').priority).toBeUndefined();
  });

  it('"סופר" consumed as an intensifier is not the supermarket', () => {
    expect(fields('סופר דחוף לסדר').categoryId).toBeUndefined();
    expect(fields('ללכת לסופר דחוף').categoryId).toBe('shopping');
  });

  it('strips a leading "תזכיר לי" and its variants', () => {
    expect(fields('תזכיר לי מחר לשלם ארנונה')).toEqual({
      title: 'לשלם ארנונה',
      scheduledFor: '2026-10-05',
      categoryId: 'finance'
    });
    expect(fields('תזכירי לי לקנות חלב').title).toBe('לקנות חלב');
    expect(fields('להזכיר לי, לקנות חלב').title).toBe('לקנות חלב');
    expect(fields('תזכיר לי').title).toBe('תזכיר לי'); // nothing else left: keep it
    expect(fields('תזכיר לי מחר').title).toBe('תזכיר לי');
    expect(fields('לבקש מדנה להזכיר לי').title).toBe('לבקש מדנה להזכיר לי'); // only a leading one
  });

  it('"בתאריך" / "לתאריך" / "תאריך" belong to the date phrase', () => {
    expect(fields('בתאריך 15/10 פגישה')).toEqual({ title: 'פגישה', scheduledFor: '2026-10-15' });
    expect(fields('פגישה לתאריך 15/10')).toEqual({ title: 'פגישה', scheduledFor: '2026-10-15' });
    expect(fields('פגישה תאריך 15/10')).toEqual({ title: 'פגישה', scheduledFor: '2026-10-15' });
    expect(fields('פגישה בתאריך 15 באוקטובר')).toEqual({
      title: 'פגישה',
      scheduledFor: '2026-10-15'
    });
  });

  it('drops empty quote pairs and empty brackets left by a removed phrase', () => {
    expect(fields('לשלם "מחר"').title).toBe('לשלם');
    expect(fields('לשלם [מחר]').title).toBe('לשלם');
    expect(fields('לשלם ״מחר״').title).toBe('לשלם');
    expect(fields('לקנות "חלב" ()').title).toBe('לקנות "חלב" ()'); // nothing removed: untouched
  });
});

// ───────────────────────────── M4: "עד" introducers ─────────────────────────────

describe('M4: "עד" introducers', () => {
  it.each([
    ['עד לתאריך 15/10 לשלם', 'לשלם', '2026-10-15'],
    ['עד התאריך 15/10 לשלם', 'לשלם', '2026-10-15'],
    ['לשלם עד ל-15/10', 'לשלם', '2026-10-15'],
    ['לשלם (עד מחר)', 'לשלם', '2026-10-05'],
    ['לשלם "עד מחר"', 'לשלם', '2026-10-05'],
    ['לשלם לא יאוחר מ-15/10', 'לשלם', '2026-10-15'],
    ['לשלם לא יאוחר ממחר', 'לשלם', '2026-10-05'],
    ['לשלם לא יאוחר מיום חמישי', 'לשלם', '2026-10-08'],
    ['לשלם לא יאוחר מחמישי', 'לשלם', '2026-10-08'],
    ['לשלם לא יאוחר מה-10', 'לשלם', '2026-10-10']
  ])('%s', (input, title, dueDate) => {
    const r = fields(input);
    expect(r.title).toBe(title);
    expect(r.dueDate).toBe(dueDate);
    expect(r.scheduledFor).toBeUndefined();
  });

  it('"מיום חמישי" without "לא יאוחר" is "since Thursday", not a date', () => {
    expectNoDate('החשבונית מיום חמישי');
  });
});

// ───────────────────────────── M6: colloquial forms ─────────────────────────────

describe('M6: colloquial forms', () => {
  it('"יום א"–"יום ש" without a geresh, at a word boundary', () => {
    expect(fields('ביום ג לקבוע תור').scheduledFor).toBe('2026-10-06');
    expect(fields('לקבוע תור יום ה').scheduledFor).toBe('2026-10-08');
    expect(fields('יום ו, לנקות').scheduledFor).toBe('2026-10-09');
    expect(fields('ביום ש').scheduledFor).toBe('2026-10-10');
    for (const input of ['יום אחד לנוח', 'יום שלם בים', 'יום של כיף', 'ביום ה-15 לבדוק']) {
      expect(fields(input).scheduledFor, input).toBeUndefined();
    }
  });

  it('"(עד) ה-N (לחודש)" is the next occurrence of day N', () => {
    expect(fields('עד ה-10 לשלם ארנונה')).toEqual({
      title: 'לשלם ארנונה',
      dueDate: '2026-10-10',
      categoryId: 'finance'
    });
    expect(fields('לשלם עד ה-1').dueDate).toBe('2026-11-01');
    expect(fields('לשלם עד ה-4').dueDate).toBe('2026-10-04');
    expect(fields('לשלם ב-1 לחודש')).toEqual({
      title: 'לשלם',
      scheduledFor: '2026-11-01',
      categoryId: 'finance'
    });
    expect(fields('לשלם ה-15 לחודש').scheduledFor).toBe('2026-10-15');
    expect(fields('לשלם ביום ה-15 לחודש').scheduledFor).toBe('2026-10-15');
    expect(fields('לשלם ה-10 לחודש הבא')).toEqual({
      title: 'לשלם',
      scheduledFor: '2026-11-10',
      categoryId: 'finance'
    });
    expect(fields('לשלם ה-31 לחודש הבא').scheduledFor).toBeUndefined(); // 31 Nov does not exist
    expect(fields('לשלם עד ה-31', new Date('2026-11-05T08:00:00Z')).dueDate).toBe('2026-12-31');
  });

  it('"עד ה-N" followed by a plural noun is a count, not a date', () => {
    expect(fields('לחכות עד ה-10 ילדים').dueDate).toBeUndefined();
  });

  it('a bare "ה-N" is an ordinal, not a date', () => {
    for (const input of ['הפעם ה-3 שאני מזכיר', 'בקומה ה-3', 'הילד ה-2 בתור']) {
      expect(fields(input).scheduledFor, input).toBeUndefined();
      expect(fields(input).title, input).toBe(input);
    }
  });

  it('"כל (יום) X" is weekly, starting on the next X', () => {
    expect(fields('חוג כל יום שלישי בשעה 5')).toEqual({
      title: 'חוג',
      scheduledFor: '2026-10-06',
      dueTime: '17:00',
      recurrence: { freq: 'weekly' }
    });
    expect(fields('לכבס כל יום ראשון')).toEqual({
      title: 'לכבס',
      scheduledFor: '2026-10-11',
      recurrence: { freq: 'weekly' }
    });
    expect(fields('לכבס בכל שבת')).toEqual({
      title: 'לכבס',
      scheduledFor: '2026-10-10',
      recurrence: { freq: 'weekly' }
    });
    expect(fields("חוג כל יום ה'")).toEqual({
      title: 'חוג',
      scheduledFor: '2026-10-08',
      recurrence: { freq: 'weekly' }
    });
    // an explicit date wins the scheduledFor field
    expect(fields('חוג כל יום שלישי, מתחילים ב-20/10')).toMatchObject({
      scheduledFor: '2026-10-20',
      recurrence: { freq: 'weekly' }
    });
  });

  it('"כל שני וחמישי" (two days, or the idiom "all the time") is left alone', () => {
    expect(fields('לבדוק כל שני וחמישי')).toEqual({ title: 'לבדוק כל שני וחמישי' });
    expect(fields('חוג כל יום שני וחמישי')).toEqual({ title: 'חוג כל יום שני וחמישי' });
    expect(fields('לבדוק כל שלישי מהמשתתפים').recurrence).toBeUndefined();
  });

  it('"הערב" is today', () => {
    expect(fields('לבשל הערב')).toEqual({ title: 'לבשל', scheduledFor: '2026-10-04' });
    expect(fields('לבשל עד הערב')).toEqual({ title: 'לבשל', dueDate: '2026-10-04' });
    expect(fields('לבשל הערב בשעה 8')).toEqual({
      title: 'לבשל',
      scheduledFor: '2026-10-04',
      dueTime: '20:00'
    });
  });

  it('common misspellings', () => {
    expect(fields('להתקשר מחרתים').scheduledFor).toBe('2026-10-06');
    expect(fields('להתקשר ביום חמשי').scheduledFor).toBe('2026-10-08');
    expect(fields('להתקשר ביום שלשי').scheduledFor).toBe('2026-10-06');
    expect(fields('להתקשר ביום רבעי').scheduledFor).toBe('2026-10-07');
    expect(fields('להתקשר עד חמשי').dueDate).toBe('2026-10-08');
  });
});

// ───────────────────────────── decisions (b), (c), (d) ─────────────────────────────

describe('decision (b): a single "!" no longer sets priority', () => {
  it('leaves "!" in the title and sets nothing', () => {
    expect(fields('לשלם ארנונה!')).toEqual({ title: 'לשלם ארנונה!', categoryId: 'finance' });
    expect(fields('לקנות חלב !')).toEqual({ title: 'לקנות חלב !', categoryId: 'shopping' });
    expect(fields('!')).toEqual({ title: '!' });
  });

  it('"!!" is high (Phase 1 council) and "!" still rides along with a priority word', () => {
    expect(fields('לשלם ארנונה!!').priority).toBe('high');
    expect(fields('חשוב! לשלם')).toEqual({
      title: 'לשלם',
      priority: 'high',
      categoryId: 'finance'
    });
  });
});

describe('decision (c): a year-less past date up to 14 days back stays this year', () => {
  it('is overdue rather than a year away', () => {
    expect(fields('לשלם קנס עד 1/10').dueDate).toBe('2026-10-01');
    expect(fields('לשלם קנס 1/10').scheduledFor).toBe('2026-10-01');
    expect(fields('לשלם 20/9').scheduledFor).toBe('2026-09-20'); // exactly 14 days back
    expect(fields('פגישה 3 באוקטובר').scheduledFor).toBe('2026-10-03');
  });

  it('15 days back rolls to next year (and an un-introduced roll that far is dropped)', () => {
    expect(fields('לשלם ב-19/9').scheduledFor).toBe('2027-09-19');
    expect(fields('לשלם 19/9').scheduledFor).toBeUndefined();
    expect(fields('פגישה 19 בספטמבר').scheduledFor).toBe('2027-09-19');
  });

  it('crosses the year boundary in early January', () => {
    const jan3 = new Date('2027-01-03T08:00:00Z');
    expect(fields('לשלם עד 28/12', jan3).dueDate).toBe('2026-12-28');
    expect(fields('לשלם עד 5/1', jan3).dueDate).toBe('2027-01-05');
  });
});

describe('decision (d): a time with no date is today if still ahead, else tomorrow', () => {
  it.each([
    ['להתקשר בשעה 17:30', '2026-10-04'],
    ['להתקשר ב-9:05', '2026-10-04'],
    ['להתקשר ב-9:00', '2026-10-05'], // exactly now: not "later than now"
    ['להתקשר ב-8:00', '2026-10-05'],
    ['להתקשר בשעה 10 בבוקר', '2026-10-04']
  ])('%s', (input, scheduledFor) => {
    expect(fields(input).scheduledFor).toBe(scheduledFor);
  });

  it('does not invent a date when there is a due date or a recurring weekday', () => {
    expect(fields('להתקשר עד מחר ב-17:00')).toEqual({
      title: 'להתקשר',
      dueDate: '2026-10-05',
      dueTime: '17:00'
    });
  });

  it('uses the wall clock in the given time zone', () => {
    // 21:00Z = 00:00 Oct 5 in Jerusalem but still 21:00 Oct 4 in UTC
    const late = new Date('2026-10-04T21:00:00Z');
    expect(parseQuickAdd('להתקשר ב-22:00', late).scheduledFor).toBe('2026-10-05');
    expect(parseQuickAdd('להתקשר ב-22:00', late, 'UTC').scheduledFor).toBe('2026-10-04');
    expect(parseQuickAdd('להתקשר ב-20:00', late, 'UTC').scheduledFor).toBe('2026-10-05');
  });
});

// ───────────────────────────── minors ─────────────────────────────

describe('minors', () => {
  it('an adjective after a noun is not a recurrence', () => {
    expect(fields('לבטל מנוי שנתי')).toEqual({ title: 'לבטל מנוי שנתי' });
    // niqqud on the noun's last letter does not make it "punctuation"
    expect(fields('לבטל מנוי\u{5B8} שנתי').recurrence).toBeUndefined();
    expect(fields('להגיש דוח חודשי')).toEqual({ title: 'להגיש דוח חודשי' });
    expect(fields('ניקיון שבועי').recurrence).toBeUndefined();
  });

  it('a recurrence adjective at the start, after punctuation or after "באופן" still counts', () => {
    expect(fields('שנתי: לחדש ביטוח רכב')).toEqual({
      title: 'לחדש ביטוח רכב',
      recurrence: { freq: 'yearly' },
      categoryId: 'car'
    });
    // a weekly repeat with no day is this week's plan (Phase 1 council)
    expect(fields('להשקות עציצים - שבועי')).toEqual({
      title: 'להשקות עציצים',
      scheduledFor: '2026-10-10',
      weekPlan: true,
      recurrence: { freq: 'weekly' }
    });
    expect(fields('להשקות עציצים (חודשי)').recurrence).toEqual({ freq: 'monthly' });
    expect(fields('להשקות עציצים באופן שבועי')).toEqual({
      title: 'להשקות עציצים',
      scheduledFor: '2026-10-10',
      weekPlan: true,
      recurrence: { freq: 'weekly' }
    });
  });

  it('"מהיום" (from now on) is not a date', () => {
    expectNoDate('מהיום לאכול בריא');
    expectNoDate('ומהיום לא לשכוח');
    expect(fields('ממחר להתחיל דיאטה').scheduledFor).toBe('2026-10-05'); // "starting tomorrow"
  });

  it('"ערב" before a weekday (eve of) is not that weekday', () => {
    expect(fields('לבשל בערב יום שישי').scheduledFor).toBeUndefined();
    expect(fields('לבשל ערב שבת').scheduledFor).toBeUndefined();
  });
});

// ───────────────────────────── found while probing (round 2) ─────────────────────────────

describe('probe findings', () => {
  it('"לפני" vetoes only a bare day name, and never "לפני הצהריים"', () => {
    expect(fields('ביום שישי לפני ארוחת ערב').scheduledFor).toBe('2026-10-09');
    expect(fields('לטפל בראשון לפני השני')).toEqual({ title: 'לטפל בראשון לפני השני' });
    expect(fields('להתקשר בשני לפני הצהריים')).toEqual({
      title: 'להתקשר',
      scheduledFor: '2026-10-05'
    });
  });

  it('"עד" before a bracketed date still makes it a due date', () => {
    expect(fields('לשלם עד (מחר)')).toMatchObject({ title: 'לשלם', dueDate: '2026-10-05' });
  });

  it('a title with no word left falls back to the raw input', () => {
    expect(fields('עד מחר!').title).toBe('עד מחר!');
    expect(fields('מחר ?').title).toBe('מחר ?');
  });

  it('a removed phrase does not leave a space before a closing "!" or "?"', () => {
    expect(fields('לנקות את המרפסת בשבת!').title).toBe('לנקות את המרפסת!');
    expect(fields('מה עם הרכב מחר?').title).toBe('מה עם הרכב?');
  });

  it('a time followed by more minutes it cannot read is no time at all', () => {
    expect(fields('להתקשר בשעה 5 ו-10 דקות').dueTime).toBeUndefined();
  });

  it('an hour range right after a date needs no clean ending', () => {
    expect(fields('מחר בין 10 ל-12 טכנאי')).toMatchObject({
      title: 'טכנאי',
      scheduledFor: '2026-10-05',
      dueTime: '10:00'
    });
  });

  it('a geresh-less weekday letter before a clock time is the weekday', () => {
    expect(fields('יום ב 10:00 פגישה')).toEqual({
      title: 'פגישה',
      scheduledFor: '2026-10-05',
      dueTime: '10:00'
    });
  });

  it('a version or a chapter:verse is not a time', () => {
    expect(fields('גרסה 2:10 לעדכן')).toEqual({ title: 'גרסה 2:10 לעדכן' });
    expect(fields('לקרוא פרק 3:16')).toEqual({ title: 'לקרוא פרק 3:16' });
  });

  it('an offset with a half or a range after it is not read partially', () => {
    expect(fields('בעוד שבוע וחצי לחזור')).toEqual({ title: 'בעוד שבוע וחצי לחזור' });
    expect(fields('בעוד יומיים-שלושה לחזור')).toEqual({ title: 'בעוד יומיים-שלושה לחזור' });
    expect(fields('בעוד יומיים או שלושה לחזור').scheduledFor).toBeUndefined();
  });

  it('"בין D1 ל-D2" is one phrase and takes the first date', () => {
    expect(fields('בין 15/10 ל-20/10 בחופש')).toEqual({
      title: 'בחופש',
      scheduledFor: '2026-10-15'
    });
  });

  it('"לא יאוחר מ-17:00" is a time', () => {
    expect(fields('לסיים לא יאוחר מ-17:00')).toMatchObject({ title: 'לסיים', dueTime: '17:00' });
    expect(fields('לסיים לא יאוחר מהשעה 5')).toMatchObject({ title: 'לסיים', dueTime: '17:00' });
  });

  it('"כל יום ראשון לחודש" (the 1st of every month) is not weekly', () => {
    const r = fields('כל יום ראשון לחודש לשלם');
    expect(r.recurrence).toBeUndefined();
    expect(r.scheduledFor).toBeUndefined();
  });

  it('"החל מ-<date>" consumes "החל"', () => {
    expect(fields('החל מ-1/11 תעריף חדש')).toEqual({
      title: 'תעריף חדש',
      scheduledFor: '2026-11-01'
    });
    expect(fields('החל ממחר לרוץ')).toEqual({ title: 'לרוץ', scheduledFor: '2026-10-05' });
  });
});
