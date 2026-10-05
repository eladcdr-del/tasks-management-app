// Phase 1 council fixes for the quick-add parser (council-b C1, M1–M5 and minors; council-a minors 5
// and 13; Blueprint §3 "Phase 1 council amendments"). The governing rules: a wrong chip is worse than
// no chip, and the parser never consumes text a chip does not carry.
import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type ParseMatch, type ParseResult } from './quickAdd';

/** Sunday 2026-10-04, 09:00 in Asia/Jerusalem (IDT, UTC+3). */
const NOW = new Date('2026-10-04T06:00:00Z');
/** Sunday 2026-10-04, 21:00 Jerusalem. */
const NIGHT = new Date('2026-10-04T18:00:00Z');
/** Friday 2026-10-09 and Saturday 2026-10-10, 09:00 Jerusalem. */
const FRI = new Date('2026-10-09T06:00:00Z');
const SAT = new Date('2026-10-10T06:00:00Z');

const parse = (input: string, now: Date = NOW, dismissed: string[] = []): ParseResult =>
  parseQuickAdd(input, now, 'Asia/Jerusalem', { dismissed });
const fields = (input: string, now: Date = NOW): Omit<ParseResult, 'matches'> => {
  const { matches: _matches, ...rest } = parse(input, now);
  return rest;
};
const chip = (r: ParseResult, kind: ParseMatch['kind']): ParseMatch | undefined =>
  r.matches.find((m) => m.kind === kind);

/** No date, no time, no priority, no recurrence, no hard flag; the title is the input. */
function expectUntouched(input: string, now: Date = NOW): void {
  const r = parse(input, now);
  expect(r.scheduledFor, input).toBeUndefined();
  expect(r.dueDate, input).toBeUndefined();
  expect(r.dueTime, input).toBeUndefined();
  expect(r.priority, input).toBeUndefined();
  expect(r.hardDeadline, input).toBeUndefined();
  expect(r.recurrence, input).toBeUndefined();
  expect(r.weekPlan, input).toBeUndefined();
  expect(r.title, input).toBe(input);
  expect(
    r.matches.every((m) => m.kind === 'category'),
    input
  ).toBe(true);
}

// ───────────────────────────── 1. C1: morning times ─────────────────────────────

describe('C1: unpadded hours 1–5 are PM; 6 and 7 need a part of day or a strong cue', () => {
  it.each([
    // council-b C1 row: "להעיר את הילדים ב-7:30" gave 19:30
    ['להעיר את הילדים ב-7:30', 'להעיר את הילדים', '07:30'],
    ['להעיר את הילדים בשעה 7', 'להעיר את הילדים', '07:00'],
    ['ולהעיר את דני ב-6:45', 'ולהעיר את דני', '06:45'],
    ['הסעה לגן ב-7:15', 'הסעה לגן', '07:15'],
    ['ההסעה מגיעה ב-7:10', 'ההסעה מגיעה', '07:10'],
    ['להסיע את דני ב-7:40', 'להסיע את דני', '07:40'],
    ['לקחת את נועה לגן ב-7:45', 'לקחת את נועה לגן', '07:45'],
    ['לבית ספר ב-7:30 עם התיק', 'לבית ספר עם התיק', '07:30'],
    ['טיסה לאילת ב-6:40', 'טיסה לאילת', '06:40'],
    ['ההמראה ב-6:15', 'ההמראה', '06:15'],
    ['בדיקת דם ב-7:00', 'בדיקת דם', '07:00'],
    ['בדיקות דם בשעה 6:30', 'בדיקות דם', '06:30'],
    ['ארוחת ערב אצל סבתא ב-7:30', 'ארוחת ערב אצל סבתא', '19:30'],
    ['מסיבה בשעה 7', 'מסיבה', '19:00'],
    ['ערב הורים ב-6:30', 'ערב הורים', '18:30'],
    // a part-of-day word settles it
    ['להתקשר בשעה 6 בבוקר', 'להתקשר', '06:00'],
    ['להתקשר בשעה 7 בערב', 'להתקשר', '19:00'],
    ['להתקשר בבוקר בשעה 7:30', 'להתקשר', '07:30'],
    ['להתקשר מחר בבוקר ב-7:30', 'להתקשר', '07:30'],
    ['להתקשר הערב ב-7:30', 'להתקשר', '19:30'],
    // zero-padded is literal; 1–5 is PM; 8 and up unchanged
    ['להתקשר 07:30', 'להתקשר', '07:30'],
    ['להתקשר ב-06:45', 'להתקשר', '06:45'],
    ['להתקשר ב-5:30', 'להתקשר', '17:30'],
    ['להתקשר בשעה 1', 'להתקשר', '13:00'],
    ['להתקשר בשעה 5 וחצי', 'להתקשר', '17:30'],
    ['להתקשר בשעה 8', 'להתקשר', '08:00'],
    ['להתקשר ב-9:15', 'להתקשר', '09:15'],
    ['להתקשר ב-12:00', 'להתקשר', '12:00'],
    ['להתקשר ב-19:30', 'להתקשר', '19:30']
  ])('%s → %s at %s', (input, title, dueTime) => {
    const r = parse(input);
    expect(r.dueTime).toBe(dueTime);
    expect(r.title).toBe(title);
  });

  it.each([
    'להתקשר לדני ב-7:30',
    'פגישה בשעה 6',
    'פגישה בשעה 7 וחצי',
    'לצאת מהבית 6:45',
    'עד 7:00 לסיים',
    // both an AM and a PM cue: still ambiguous
    'טיסה ומסיבה בשעה 7'
  ])('%s: no time chip, the time stays in the title', (input) => {
    expectUntouched(input);
  });

  it('an ambiguous time next to a date: the date stays, the time stays in the title', () => {
    expect(fields('להתקשר מחר ב-7:30')).toEqual({
      title: 'להתקשר ב-7:30',
      scheduledFor: '2026-10-05'
    });
  });

  it('the hour-1–5 rule also holds for a range ("בין 2 ל-4")', () => {
    expect(fields('להתקשר בין 2 ל-4').dueTime).toBe('14:00');
    expect(fields('להתקשר בין 6 ל-8').dueTime).toBeUndefined();
    expect(fields('להתקשר בין 6 ל-8 בבוקר').dueTime).toBe('06:00');
  });
});

// ───────────────────────────── 2. M1: weekday + explicit date ─────────────────────────────

describe('M1: a weekday and an explicit date are one phrase', () => {
  it.each([
    ['פגישה ביום חמישי 15/10', 'פגישה', '2026-10-15', 'ביום חמישי 15/10'],
    ['פגישה ביום חמישי, 15/10', 'פגישה', '2026-10-15', 'ביום חמישי, 15/10'],
    ['פגישה ביום חמישי ה-15/10', 'פגישה', '2026-10-15', 'ביום חמישי ה-15/10'],
    ['פגישה ביום חמישי בתאריך 15/10', 'פגישה', '2026-10-15', 'ביום חמישי בתאריך 15/10'],
    ['פגישה יום חמישי 15.10', 'פגישה', '2026-10-15', 'יום חמישי 15.10'],
    ['פגישה יום ה׳ ה-15/10', 'פגישה', '2026-10-15', 'יום ה׳ ה-15/10'],
    ['פגישה ביום ראשון ה-18.10', 'פגישה', '2026-10-18', 'ביום ראשון ה-18.10'],
    ['פגישה ביום חמישי 15 באוקטובר', 'פגישה', '2026-10-15', 'ביום חמישי 15 באוקטובר'],
    ['פגישה בחמישי 15/10', 'פגישה', '2026-10-15', 'בחמישי 15/10'],
    ['פגישה ביום חמישי ה-15', 'פגישה', '2026-10-15', 'ביום חמישי ה-15'],
    ['ביום חמישי 15/10 פגישה עם המורה', 'פגישה עם המורה', '2026-10-15', 'ביום חמישי 15/10'],
    // today is Sunday 4/10: the date wins over "the next Sunday"
    ['פגישה ביום ראשון 4/10', 'פגישה', '2026-10-04', 'ביום ראשון 4/10']
  ])('%s → %s', (input, title, iso, text) => {
    const r = parse(input);
    expect(r.scheduledFor).toBe(iso);
    expect(r.title).toBe(title);
    expect(r.matches.map((m) => m.text)).toEqual([text]);
  });

  it('after "עד" the pair is the due date', () => {
    expect(fields('להגיש עד יום חמישי 15/10')).toEqual({ title: 'להגיש', dueDate: '2026-10-15' });
  });

  it.each([
    'פגישה ביום חמישי 16/10',
    'פגישה יום ה׳ ה-16/10',
    'ביום שני 3/1 פגישה',
    'פגישה ביום שני ה-15',
    'פגישה ביום חמישי 16 באוקטובר'
  ])(
    '%s: the weekday and the date disagree, so no date chip and the title is untouched',
    (input) => {
      expectUntouched(input);
    }
  );
});

// ───────────────────────────── 3. M2: numbers that are not dates ─────────────────────────────

describe('M2: installments, prices and old years are not dates', () => {
  it.each([
    'תשלום 3/10 לחברת החשמל',
    'תשלומים 3/12 על המקרר',
    'שילמנו מתוך 5/10',
    'לקנות גבינה ב-19.9',
    'מכנסיים ב-12.5',
    'לקנות ב-9.5',
    'חשבונית 12/10/2020',
    'חשבונית מ-12/10/2025',
    'קבלה 1 בינואר 2020'
  ])('%s', (input) => {
    expectUntouched(input);
  });

  it('a dotted date after ב- counts inside [today − 14 days, today + 120 days]', () => {
    expect(fields('אסיפה ב-8.10').scheduledFor).toBe('2026-10-08');
    expect(fields('אסיפה ב-20.9').scheduledFor).toBe('2026-09-20');
    expect(fields('אסיפה ב-3.1').scheduledFor).toBe('2027-01-03');
  });

  it('an explicit year within the 14-day grace still counts', () => {
    expect(fields('להגיש 20/9/2026').scheduledFor).toBe('2026-09-20');
    expect(fields('להגיש 12/10/2026').scheduledFor).toBe('2026-10-12');
    expect(fields('להגיש 12/10/2027').scheduledFor).toBe('2027-10-12');
  });
});

// ───────────────────────────── 4. M3: consumed words ─────────────────────────────

describe('M3: never consume text a chip does not carry', () => {
  it('a time range is one chip: label "08:00–12:00", dueTime the start, the whole range consumed', () => {
    const r = parse('טכנאי מחר בין 8 ל-12');
    expect(r.title).toBe('טכנאי');
    expect(r.scheduledFor).toBe('2026-10-05');
    expect(r.dueTime).toBe('08:00');
    expect(chip(r, 'time')).toMatchObject({ text: 'בין 8 ל-12', label: '08:00–12:00' });
  });

  it.each([
    ['להתקשר בין 10:00 ל-12:00', '10:00', 'היום 10:00–12:00'],
    ['להתקשר 10:00-12:00', '10:00', 'היום 10:00–12:00'],
    ['להתקשר מ-10:00 עד 12:00', '10:00', 'היום 10:00–12:00'],
    ['להתקשר בין 2 ל-4', '14:00', 'היום 14:00–16:00'],
    ['להתקשר בין 10 ל-2', '10:00', 'היום 10:00–14:00'],
    ['להתקשר בין 4 ל-6 אחה״צ', '16:00', 'היום 16:00–18:00'],
    ['להתקשר בין השעות 9 ל-11', '09:00', 'היום 09:00–11:00']
  ])('%s → %s (%s)', (input, dueTime, label) => {
    const r = parse(input);
    expect(r.dueTime).toBe(dueTime);
    expect(r.title).toBe('להתקשר');
    expect(chip(r, 'time')?.label).toBe(label);
  });

  it('a time range alone implies today, never tomorrow (even once it has passed)', () => {
    expect(fields('טכנאי בין 8 ל-9').scheduledFor).toBe('2026-10-04');
    expect(fields('טכנאי בין 10 ל-12', NIGHT).scheduledFor).toBe('2026-10-04');
    // a single time that has passed is still tomorrow (decision (d))
    expect(fields('טכנאי ב-8:30').scheduledFor).toBe('2026-10-05');
  });

  it('a part of day next to a date goes on the date chip label; no time is set', () => {
    const morning = parse('להתקשר מחר בבוקר');
    expect(morning.dueTime).toBeUndefined();
    expect(morning.title).toBe('להתקשר');
    expect(chip(morning, 'date')?.label).toBe('מחר בבוקר · יום ב׳ 5/10');
    expect(chip(parse('להתקשר ביום חמישי בצהריים'), 'date')?.label).toBe('יום ה׳ 8/10 בצהריים');
    expect(chip(parse('להתקשר היום בערב'), 'date')?.label).toBe('היום בערב · יום א׳ 4/10');
    expect(chip(parse('לשלם עד מחר בבוקר'), 'due')?.label).toBe('עד מחר בבוקר · יום ב׳ 5/10');
    expect(chip(parse('חוג כל יום שלישי אחה״צ'), 'recurrence')?.label).toBe(
      'כל שבוע · יום ג׳ 6/10 אחה״צ'
    );
  });

  it('"לפני <date>" is due the day before, labelled "עד …", and leaves the title', () => {
    const r = parse('להחזיר את הספר לפני יום שישי');
    expect(r.dueDate).toBe('2026-10-08');
    expect(r.scheduledFor).toBeUndefined();
    expect(r.title).toBe('להחזיר את הספר');
    expect(chip(r, 'due')).toMatchObject({ text: 'לפני יום שישי', label: 'עד יום ה׳ 8/10' });
    expect(fields('לשלם לפני 15/10').dueDate).toBe('2026-10-14');
    expect(fields('לסיים לפני מחר').dueDate).toBe('2026-10-04');
    expect(fields('לחדש ביטוח לפני סוף החודש').dueDate).toBe('2026-10-30');
    expect(fields('לקנות מתנה לפני שישי').dueDate).toBe('2026-10-08');
  });

  it('"שבוע לפני 15/10" is not a date at all (the offset is not read)', () => {
    expectUntouched('להזמין שבוע לפני 15/10');
    expectUntouched('יומיים לפני יום שישי');
  });

  it('"במהלך השבוע" is a week plan and consumes במהלך', () => {
    expect(fields('במהלך השבוע לסדר את המחסן')).toEqual({
      title: 'לסדר את המחסן',
      scheduledFor: '2026-10-10',
      weekPlan: true
    });
  });

  it('"לא דחוף אבל חשוב" is high, with no dangling אבל', () => {
    expect(fields('לא דחוף אבל חשוב לתקן את הברז')).toEqual({
      title: 'לתקן את הברז',
      priority: 'high',
      categoryId: 'home'
    });
    expect(fields('לא דחוף, אבל חשוב: לחדש דרכון')).toEqual({
      title: 'לחדש דרכון',
      priority: 'high'
    });
    expect(fields('לחדש דרכון, חשוב אבל לא דחוף')).toEqual({
      title: 'לחדש דרכון',
      priority: 'high'
    });
  });

  it.each([
    'חשוב לי שהילדים יאכלו ירקות',
    'חשוב שנזכור את הדרכונים',
    'מאוד חשוב לי שתבוא',
    'אם דחוף, להתקשר לסבתא',
    'אם זה דחוף להתקשר לסבתא'
  ])('%s: a ש-clause or a condition is not a priority', (input) => {
    expectUntouched(input);
  });

  it.each([
    ['להתקשר לסבתא מחר, לקנות לה פרחים', 'להתקשר לסבתא, לקנות לה פרחים'],
    ['לקנות חלב, דחוף, ולהתקשר לאמא', 'לקנות חלב, ולהתקשר לאמא'],
    ['לקנות חלב, מחר דחוף ולהתקשר לאמא', 'לקנות חלב, ולהתקשר לאמא'],
    ['מחר, לשלם ארנונה', 'לשלם ארנונה'],
    ['לשלם ארנונה, מחר', 'לשלם ארנונה'],
    ['לשלם ארנונה, דחוף, מחר', 'לשלם ארנונה'],
    ['לשלם ארנונה מחר ולקנות חלב', 'לשלם ארנונה ולקנות חלב']
  ])('a clause comma survives: %s → %s', (input, title) => {
    expect(parse(input).title).toBe(title);
  });
});

// ───────────────────────────── 5. M4: a lone time next to a day word ─────────────────────────────

// A time with no day was once saved on its own, where no screen shows it (launch audit CON-1): now
// it is not read at all and stays in the title, next to the day word that blocked the date.
describe('M4: a lone time next to an unconsumed day word implies no date', () => {
  it.each([
    'ארוחת שישי אצל סבתא 19:30',
    'ארוחת חג אצל סבתא 19:30',
    'הצגה באוקטובר בשעה 20:00',
    'מוצאי חג בשעה 20:00',
    // CON-1: the name שני, Friday dinner and the kindergarten's Kabbalat Shabbat
    'לאסוף את שני מהגן ב-16:30',
    'להתקשר לשני ב-4',
    'ארוחת שישי אצל סבתא ב-19:30',
    'קבלת שבת בגן ב-12',
    'קבלת שבת בגן ב-12:00',
    'לקנות שני כרטיסים להצגה ב-20:00',
    'לשבת עם הילדים על שיעורי בית ב-17:00',
    'תור ראשון לפיזיותרפיה ב-10:00',
    'אסיפת הורים של שני בשעה 19:00'
  ])('%s: no date, so the time stays in the title', (input) => {
    expectUntouched(input);
    expect(chip(parse(input), 'time')).toBeUndefined();
  });

  it('the title keeps the day word and the time', () => {
    expect(fields('ארוחת שישי אצל סבתא 19:30')).toEqual({ title: 'ארוחת שישי אצל סבתא 19:30' });
  });

  it('a dismissed date leaves the time in the title too, without an invented date', () => {
    const r = parse('מחר 19:30 להתקשר לסבתא', NOW, ['date:מחר']);
    expect(r.dueTime).toBeUndefined();
    expect(r.scheduledFor).toBeUndefined();
    expect(r.title).toBe('מחר 19:30 להתקשר לסבתא');
  });

  it.each([
    ['השבוע ב-17:00 להתקשר', 'ב-17:00 להתקשר'],
    ['כל שבוע ב-17:00 חוג', 'ב-17:00 חוג']
  ])('a week plan has no time of day: %s keeps the time in the title', (input, title) => {
    const r = parse(input);
    expect(r.weekPlan).toBe(true);
    expect(r.dueTime).toBeUndefined();
    expect(r.title).toBe(title);
  });

  it('with no day word in the line a lone time still implies today or tomorrow', () => {
    expect(fields('להתקשר לסבתא 19:30').scheduledFor).toBe('2026-10-04');
  });
});

// ───────────────────────────── 6. M5: categories from common verbs ─────────────────────────────

describe('M5: common verbs do not invent categories', () => {
  it.each([
    'להחזיר טלפון לדני',
    'להחזיר לו טלפון',
    'להחזיר שיחה לאמא',
    'להחזיר כסף לשכן',
    'להחזיר את הכסף לשכן',
    'להחזיר את הילדים מהגן',
    'להחזיר את העגלה הביתה',
    'להחזיר את הספר לספרייה',
    'להחזיר את המקדחה לשכן',
    'להחליף סדינים',
    'להחליף מצעים בחדר של נועה',
    'להחליף טיטול',
    'להחליף חיתול לתינוק',
    'להחליף מים לדגים',
    'להחליף ספק אינטרנט',
    'להחליף פלאפון',
    'להחליף מכשיר',
    'להזמין מונית לשדה',
    'להזמין שולחן במסעדה',
    'להזמין מקום בחוג',
    'להזמין תור למספרה',
    'להזמין את סבתא לארוחת שישי',
    'מבחן בחשבון',
    'לקחת בחשבון את המחיר'
  ])('%s: no category', (input) => {
    const r = parse(input);
    expect(r.categoryId).toBeUndefined();
    expect(r.title).toBe(input);
  });

  it.each<[string, string]>([
    ['להחזיר חולצה לזארה', 'returns'],
    ['להחזיר מכנסיים', 'returns'],
    ['להחזיר מתנה', 'returns'],
    ['להחזיר חבילה לדואר', 'returns'],
    ['להחליף הזמנה', 'returns'],
    ['להחזיר לאיקאה את המדף', 'returns'],
    ['להחזיר ל-H&M', 'returns'],
    ['להחליף בקסטרו', 'returns'],
    ['להחזיר בפוקס', 'returns'],
    ['להחזיר משהו בעזריאלי', 'returns'],
    ['להחזיר עם קבלה', 'returns'],
    ['לקבל זיכוי', 'returns'],
    ['להחליף בחנות', 'returns'],
    ['להחליף מנעול', 'home'],
    ['להחליף מצבר', 'car'],
    ['להזמין טכנאי', 'home'],
    ['להזמין טכנאי למקרר', 'home'],
    ['להזמין אינסטלטור', 'home'],
    ['להזמין חשמלאי', 'home'],
    ['להזמין גז', 'shopping'],
    ['להזמין ספה', 'shopping'],
    ['להזמין מאמזון', 'shopping'],
    ['להזמין מתנה לדנה', 'shopping'],
    ['לבדוק יתרה בחשבון', 'finance'],
    ['להעביר כסף בחשבון הבנק', 'finance'],
    ['לשלם חשבון חשמל', 'finance'],
    ['חשבון מים', 'finance']
  ])('%s → %s', (input, categoryId) => {
    expect(parse(input).categoryId).toBe(categoryId);
  });

  it('a store word lifts the phone / money veto, never the kids / home / call veto', () => {
    expect(parse('להחזיר טלפון לחנות').categoryId).toBe('returns');
    expect(parse('להחזיר את הילדים מהקניון').categoryId).toBeUndefined();
    expect(parse('להחזיר שיחה לחנות').categoryId).toBeUndefined();
  });

  it('a returns verb without a strong signal never makes "עד" a hard deadline', () => {
    expect(fields('להחזיר את הספר לספרייה עד יום חמישי')).toEqual({
      title: 'להחזיר את הספר לספרייה',
      dueDate: '2026-10-08'
    });
  });
});

// ───────────────────────────── 7. priority punctuation ─────────────────────────────

describe('priority punctuation and words', () => {
  it.each([
    ['לקנות חלב!!', 'high'],
    ['לקנות חלב!!!', 'high'],
    ['!! לקנות חלב', 'high'],
    ['דחוף!!', 'urgent'],
    ['דחוף לשלם!!!', 'urgent'],
    ['חשוב!!! לשלם', 'high'],
    ['בדחיפות לשלם ארנונה', 'urgent'],
    ['לשלם ארנונה בדחיפות', 'urgent'],
    ['דחוףףף לתקן את הברז', 'urgent'],
    ['דחוףף לתקן את הברז', 'urgent']
  ])('%s → %s', (input, priority) => {
    expect(parse(input).priority).toBe(priority);
  });

  it('the words leave the title', () => {
    expect(fields('בדחיפות לשלם ארנונה').title).toBe('לשלם ארנונה');
    expect(fields('דחוףףף לתקן את הברז').title).toBe('לתקן את הברז');
    expect(fields('לקנות חלב!!').title).toBe('לקנות חלב');
  });

  it.each(['!!', '!!!', ' !! '])('"%s" as the only content is no priority', (input) => {
    const r = parse(input);
    expect(r.priority).toBeUndefined();
    expect(r.matches).toEqual([]);
  });
});

// ───────────────────────────── 8. week plans ─────────────────────────────

describe('week plans', () => {
  it.each([
    ['להתקשר השבוע', NOW, '2026-10-10', 'השבוע · עד שבת 10/10'],
    ['להתקשר השבוע הזה', NOW, '2026-10-10', 'השבוע · עד שבת 10/10'],
    ['להתקשר בשבוע הזה', NOW, '2026-10-10', 'השבוע · עד שבת 10/10'],
    ['להתקשר במהלך השבוע', NOW, '2026-10-10', 'השבוע · עד שבת 10/10'],
    ['להתקשר השבוע', FRI, '2026-10-17', 'השבוע · עד שבת 17/10'],
    ['להתקשר השבוע', SAT, '2026-10-17', 'השבוע · עד שבת 17/10'],
    ['להתקשר בשבוע הבא', NOW, '2026-10-17', 'בשבוע הבא'],
    ['להתקשר בשבוע הבא', FRI, '2026-10-17', 'בשבוע הבא'],
    ['להתקשר בשבוע הבא', SAT, '2026-10-17', 'בשבוע הבא'],
    ['להתקשר במהלך השבוע הבא', NOW, '2026-10-17', 'בשבוע הבא']
  ])('%s (%s) → %s', (input, now, iso, label) => {
    const r = parse(input, now);
    expect(r).toMatchObject({ title: 'להתקשר', scheduledFor: iso, weekPlan: true });
    expect(chip(r, 'date')).toMatchObject({ label, weekPlan: true });
  });

  it.each([
    ['להשקות עציצים כל שבוע', 'להשקות עציצים'],
    ['פעם בשבוע לנקות את המקרר', 'לנקות את המקרר'],
    ['שבועי: לנקות את המקרר', 'לנקות את המקרר']
  ])('"%s" with no weekday and no date is this week\'s plan', (input, title) => {
    const r = parse(input);
    expect(fields(input)).toEqual({
      title,
      scheduledFor: '2026-10-10',
      weekPlan: true,
      recurrence: { freq: 'weekly' }
    });
    expect(chip(r, 'recurrence')?.alsoSets).toEqual({
      scheduledFor: '2026-10-10',
      weekPlan: true
    });
  });

  it.each([
    ['כל שבוע ביום שלישי להשקות', '2026-10-06'],
    ['כל יום שלישי להשקות', '2026-10-06'],
    ['להשקות כל שבוע, מחר', '2026-10-05'],
    ['ביום שלישי בשבוע הבא', '2026-10-13'],
    ['בסוף השבוע הבא', '2026-10-16'],
    ['בתחילת השבוע הבא', '2026-10-11'],
    ['ביום חמישי השבוע', '2026-10-08']
  ])('explicit days and dates are not week plans: %s', (input, iso) => {
    const r = parse(input);
    expect(r.scheduledFor).toBe(iso);
    expect(r.weekPlan).toBeUndefined();
    expect(r.matches.some((m) => 'weekPlan' in m || m.alsoSets?.weekPlan)).toBe(false);
  });

  it('"עד" a week phrase is a due date, not a plan', () => {
    expect(fields('לסיים עד השבוע הבא')).toEqual({ title: 'לסיים', dueDate: '2026-10-11' });
    expect(fields('לסיים עד סוף השבוע')).toEqual({ title: 'לסיים', dueDate: '2026-10-09' });
  });

  it('monthly and yearly repeats still set no date', () => {
    expect(fields('להשקות עציצים כל חודש')).toEqual({
      title: 'להשקות עציצים',
      recurrence: { freq: 'monthly' }
    });
  });
});

// ───────────────────────────── 9. hard deadline only with a date ─────────────────────────────

describe('hardDeadline only with a date', () => {
  it('"מועד אחרון" with no date in the line is no chip and stays in the title', () => {
    const r = parse('מועד אחרון להגיש טופס');
    expect(r.hardDeadline).toBeUndefined();
    expect(r.title).toBe('מועד אחרון להגיש טופס');
    expect(r.matches.map((m) => m.kind)).toEqual(['category']);
  });

  it('with a date it is the hard due date', () => {
    expect(fields('מועד אחרון להגיש טופס 15/10')).toEqual({
      title: 'להגיש טופס',
      dueDate: '2026-10-15',
      hardDeadline: true,
      categoryId: 'finance'
    });
  });
});

// ───────────────────────────── 10. a dismissal never promotes a ש-clause ─────────────────────────────

describe('a dismissal does not promote a candidate inside a ש-clause', () => {
  it('"מחר להזכיר לדני שמחר יש אסיפה" without the first מחר has no date', () => {
    const r = parse('מחר להזכיר לדני שמחר יש אסיפה', NOW, ['date:מחר']);
    expect(r.scheduledFor).toBeUndefined();
    expect(r.title).toBe('מחר להזכיר לדני שמחר יש אסיפה');
  });

  it('nor a date later in the ש-clause', () => {
    const r = parse('מחר להגיד לדני שהאסיפה ביום שלישי', NOW, ['date:מחר']);
    expect(r.scheduledFor).toBeUndefined();
  });

  it('an independent second date is still promoted', () => {
    expect(parse('מחר או ביום שלישי', NOW, ['date:מחר']).scheduledFor).toBe('2026-10-06');
  });
});

// ───────────────────────────── 11. fail-safe adds ─────────────────────────────

describe('fail-safe additions', () => {
  it.each([
    ['מחר ב-4 להתקשר לרופא', 'להתקשר לרופא', '2026-10-05', '16:00'],
    ['מחר ב-17 פגישה', 'פגישה', '2026-10-05', '17:00'],
    ['מחר ב-10 וחצי פגישה', 'פגישה', '2026-10-05', '10:30'],
    ['ביום שני ב-9 פגישה', 'פגישה', '2026-10-05', '09:00'],
    ['להעיר את דני מחר ב-7', 'להעיר את דני', '2026-10-05', '07:00']
  ])('bare ב-N right after a date is a time: %s', (input, title, iso, time) => {
    expect(fields(input)).toMatchObject({ title, scheduledFor: iso, dueTime: time });
  });

  it('…but not 6/7 without a cue, nor a quantity', () => {
    expect(fields('פגישה מחר ב-7')).toEqual({ title: 'פגישה ב-7', scheduledFor: '2026-10-05' });
    expect(fields('לחלק מחר ב-3 קבוצות')).toEqual({
      title: 'לחלק ב-3 קבוצות',
      scheduledFor: '2026-10-05'
    });
    expect(fields('לקנות מחר ב-5 שקלים').dueTime).toBeUndefined();
  });

  it.each([
    ['להכין עוגה לשבת', 'להכין עוגה', '2026-10-10'],
    ['לקנות פרחים לשישי.', 'לקנות פרחים', '2026-10-09'],
    ['חלות לשבת!', 'חלות!', '2026-10-10'],
    ['לקנות יין לשבת הקרובה', 'לקנות יין', '2026-10-10']
  ])('"לשישי" / "לשבת" as the target day: %s', (input, title, iso) => {
    const { categoryId: _category, ...rest } = fields(input);
    expect(rest).toEqual({ title, scheduledFor: iso });
  });

  it.each(['לשבת עם דני על השיעורים', 'למצוא מקום לשבת', 'כיסא לשבת', 'לחשוב לשני'])(
    '%s: no date',
    (input) => {
      expectUntouched(input);
    }
  );

  it.each([
    ['במוצ״ש לסדר את הסלון', 'לסדר את הסלון'],
    ['במוצאי שבת לסדר את הסלון', 'לסדר את הסלון'],
    ['מוצ"ש: לסדר את הסלון', 'לסדר את הסלון']
  ])('%s is Saturday evening', (input, title) => {
    const r = parse(input);
    expect(r.scheduledFor).toBe('2026-10-10');
    expect(r.title).toBe(title);
    expect(chip(r, 'date')?.label).toBe('שבת 10/10 בערב');
  });

  it('"במוצ״ש" said on Saturday is tonight, and steers a time to the evening', () => {
    expect(fields('במוצ״ש לסדר', SAT).scheduledFor).toBe('2026-10-10');
    expect(fields('במוצאי שבת בשעה 8 קולנוע')).toEqual({
      title: 'קולנוע',
      scheduledFor: '2026-10-10',
      dueTime: '20:00'
    });
  });

  it.each([
    ['בראשון להתקשר לבנק', 'להתקשר לבנק', '2026-10-11'],
    ['בשני לקנות מתנה', 'לקנות מתנה', '2026-10-05'],
    ['ובחמישי לאסוף את החבילה', 'לאסוף את החבילה', '2026-10-08']
  ])('a leading weekday before an infinitive: %s', (input, title, iso) => {
    const r = parse(input);
    expect(r.scheduledFor).toBe(iso);
    expect(r.title).toBe(title);
  });

  it.each(['להתקשר בשני לבנק', 'בשני הילדים לבדוק', 'בראשון לציון לאסוף חבילה'])(
    '%s: not a weekday',
    (input) => {
      expect(parse(input).scheduledFor).toBeUndefined();
    }
  );
});

// ───────────────────────────── 12. launch audit ─────────────────────────────

describe('launch audit CON-8: a plan, a deadline and one time', () => {
  it('a time next to the plan stays in the title: as dueTime it would read as the deadline', () => {
    expect(fields('תור לרופא מחר ב-10 עד יום חמישי')).toEqual({
      title: 'תור לרופא ב-10',
      scheduledFor: '2026-10-05',
      dueDate: '2026-10-08',
      categoryId: 'health'
    });
    const r = parse('להזמין אינסטלטור דחוף מחר בבוקר ב-8:30 עד יום חמישי מועד אחרון');
    expect(r).toMatchObject({
      title: 'להזמין אינסטלטור ב-8:30',
      scheduledFor: '2026-10-05',
      dueDate: '2026-10-08',
      hardDeadline: true
    });
    expect(r.dueTime).toBeUndefined();
    expect(chip(r, 'time')).toBeUndefined();
  });

  it('a time right after the deadline is the deadline time, steered by its own part of day', () => {
    expect(fields('מחר בבוקר להתחיל, עד יום חמישי בשעה 5 להגיש')).toEqual({
      title: 'להתחיל, להגיש',
      scheduledFor: '2026-10-05',
      dueDate: '2026-10-08',
      dueTime: '17:00'
    });
    expect(fields('מחר להתחיל, עד יום חמישי בערב בשעה 8').dueTime).toBe('20:00');
  });

  it('with a deadline and no plan the time is the deadline time, as before', () => {
    expect(fields('להחזיר חולצה עד יום חמישי בשעה 17:30')).toMatchObject({
      title: 'להחזיר חולצה',
      dueDate: '2026-10-08',
      dueTime: '17:30'
    });
  });
});
