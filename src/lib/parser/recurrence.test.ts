// Flexible recurrence phrases in quick add: every day, every N days / weeks / months / years, and
// lists of weekdays ("כל שני וחמישי", "בימים א' וד'"). The governing rule still holds: a wrong chip
// is worse than no chip ("כל יום הולדת", "פעמיים בשבוע" with no days).
import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type ParseResult } from './quickAdd';

/** Sunday 2026-10-04, 09:00 in Asia/Jerusalem (IDT, UTC+3). */
const NOW = new Date('2026-10-04T06:00:00Z');
/** Wednesday 2026-10-07, 09:00 Jerusalem. */
const WED = new Date('2026-10-07T06:00:00Z');

const parse = (input: string, now: Date = NOW, dismissed: string[] = []): ParseResult =>
  parseQuickAdd(input, now, 'Asia/Jerusalem', { dismissed });
const fields = (input: string, now: Date = NOW): Omit<ParseResult, 'matches'> => {
  const { matches: _matches, ...rest } = parse(input, now);
  return rest;
};
const chip = (r: ParseResult) => r.matches.find((m) => m.kind === 'recurrence');

describe('every day', () => {
  it.each(['כל יום', 'בכל יום', 'וכל יום', 'פעם ביום', 'כל יום ויום'])(
    '%s: daily, planned today',
    (phrase) => {
      const expected = {
        title: 'להשקות עציצים',
        scheduledFor: '2026-10-04',
        recurrence: { freq: 'daily' }
      };
      expect(fields(`להשקות עציצים ${phrase}`)).toEqual(expected);
      expect(fields(`${phrase} להשקות עציצים`)).toEqual(expected);
    }
  );

  it('the chip reads "כל יום", without a date, and sets today', () => {
    expect(chip(parse('להשקות עציצים כל יום'))).toMatchObject({
      key: 'recurrence:כל יום',
      field: 'recurrence',
      value: { freq: 'daily' },
      label: 'כל יום',
      alsoSets: { scheduledFor: '2026-10-04' }
    });
  });

  it('with a time still ahead: today at that time', () => {
    expect(fields('לתת כדור לכלב כל יום ב-20:00')).toEqual({
      title: 'לתת כדור לכלב',
      scheduledFor: '2026-10-04',
      dueTime: '20:00',
      recurrence: { freq: 'daily' }
    });
  });

  it('with a time already past (09:00 now): it starts tomorrow', () => {
    expect(fields('לתת כדור לכלב כל יום ב-8 בבוקר')).toEqual({
      title: 'לתת כדור לכלב',
      scheduledFor: '2026-10-05',
      dueTime: '08:00',
      recurrence: { freq: 'daily' }
    });
    const r = parse('לתת כדור לכלב כל יום ב-8 בבוקר');
    expect(chip(r)?.alsoSets).toEqual({ scheduledFor: '2026-10-05' });
  });

  it('"כל יום ב-17:00" is every day at 17:00, not every Monday ("יום ב")', () => {
    expect(fields('להוציא את הכלב כל יום ב-17:00')).toEqual({
      title: 'להוציא את הכלב',
      scheduledFor: '2026-10-04',
      dueTime: '17:00',
      recurrence: { freq: 'daily' }
    });
  });

  it('a part of day goes on the chip: "כל יום בבוקר"', () => {
    const r = parse('להשקות כל יום בבוקר');
    expect(chip(r)?.label).toBe('כל יום בבוקר');
    expect(r.title).toBe('להשקות');
    expect(r.recurrence).toEqual({ freq: 'daily' });
  });

  it('a weekday after "כל יום" is still weekly on that day', () => {
    expect(fields('חוג כל יום שלישי')).toEqual({
      title: 'חוג',
      scheduledFor: '2026-10-06',
      recurrence: { freq: 'weekly' }
    });
    expect(fields("חוג כל יום ה'").recurrence).toEqual({ freq: 'weekly' });
  });

  it.each([
    'לקנות מתנה כל יום הולדת',
    'לבדוק כל יום עבודה',
    'כל יום חול לנקות',
    'לצום כל יום כיפור',
    'לעבוד כל היום',
    'שגרת היומיום'
  ])('%s: not every day', (input) => {
    const r = fields(input);
    expect(r.recurrence, input).toBeUndefined();
    expect(r.scheduledFor, input).toBeUndefined();
  });

  it('"יומי" counts at the start, after punctuation or after "באופן", not after a noun', () => {
    expect(fields('יומי: להשקות')).toEqual({
      title: 'להשקות',
      scheduledFor: '2026-10-04',
      recurrence: { freq: 'daily' }
    });
    expect(fields('להשקות באופן יומי').recurrence).toEqual({ freq: 'daily' });
    expect(fields('לסגור דוח יומי')).toEqual({ title: 'לסגור דוח יומי' });
  });
});

describe('every N days, weeks, months, years', () => {
  it.each([
    ['כל יומיים', { freq: 'daily', interval: 2 }, 'כל יומיים'],
    ['פעם ביומיים', { freq: 'daily', interval: 2 }, 'כל יומיים'],
    ['כל 3 ימים', { freq: 'daily', interval: 3 }, 'כל 3 ימים'],
    ['כל שלושה ימים', { freq: 'daily', interval: 3 }, 'כל 3 ימים'],
    ['כל 10 ימים', { freq: 'daily', interval: 10 }, 'כל 10 ימים']
  ])('%s: every N days from today', (phrase, rule, label) => {
    const r = parse(`להשקות עציצים ${phrase}`);
    expect(fields(`להשקות עציצים ${phrase}`)).toEqual({
      title: 'להשקות עציצים',
      scheduledFor: '2026-10-04',
      recurrence: rule
    });
    expect(chip(r)?.label).toBe(label);
  });

  it.each([
    ['כל שבועיים', 2, 'כל שבועיים'],
    ['פעם בשבועיים', 2, 'כל שבועיים'],
    ['כל 3 שבועות', 3, 'כל 3 שבועות'],
    ['כל שלושה שבועות', 3, 'כל 3 שבועות'],
    ['פעם ב-4 שבועות', 4, 'כל 4 שבועות']
  ])('%s: every N weeks, this week planned (like "כל שבוע")', (phrase, interval, label) => {
    expect(fields(`לנקות את המקרר ${phrase}`)).toEqual({
      title: 'לנקות את המקרר',
      scheduledFor: '2026-10-10',
      weekPlan: true,
      recurrence: { freq: 'weekly', interval }
    });
    expect(chip(parse(`לנקות את המקרר ${phrase}`))?.label).toBe(label);
  });

  it.each([
    ['כל חודשיים', { freq: 'monthly', interval: 2 }, 'כל חודשיים'],
    ['פעם בחודשיים', { freq: 'monthly', interval: 2 }, 'כל חודשיים'],
    ['כל 3 חודשים', { freq: 'monthly', interval: 3 }, 'כל 3 חודשים'],
    ['כל שלושה חודשים', { freq: 'monthly', interval: 3 }, 'כל 3 חודשים'],
    ['פעם ב-6 חודשים', { freq: 'monthly', interval: 6 }, 'כל 6 חודשים'],
    ['כל שנתיים', { freq: 'yearly', interval: 2 }, 'כל שנתיים'],
    ['כל 2 שנים', { freq: 'yearly', interval: 2 }, 'כל שנתיים'],
    ['כל שלוש שנים', { freq: 'yearly', interval: 3 }, 'כל 3 שנים']
  ])('%s: no date of its own', (phrase, rule, label) => {
    expect(fields(`להחליף פילטר ${phrase}`)).toEqual({ title: 'להחליף פילטר', recurrence: rule });
    expect(chip(parse(`להחליף פילטר ${phrase}`))?.label).toBe(label);
  });

  it('a named day sets the first date of an every-N-weeks series', () => {
    expect(fields('חוג כל שבועיים ביום שלישי')).toEqual({
      title: 'חוג',
      scheduledFor: '2026-10-06',
      recurrence: { freq: 'weekly', interval: 2 }
    });
  });

  it('counts outside 1-99 are no recurrence', () => {
    expect(fields('לבדוק כל 0 ימים').recurrence).toBeUndefined();
    expect(fields('לבדוק כל 100 ימים').recurrence).toBeUndefined();
  });

  it('"כל החודשיים" (the whole two months) is no recurrence', () => {
    expect(fields('לעבוד כל החודשיים').recurrence).toBeUndefined();
  });
});

describe('lists of weekdays', () => {
  const MON_THU = { freq: 'weekly', weekdays: [1, 4] };
  const SUN_WED = { freq: 'weekly', weekdays: [0, 3] };

  it.each([
    'כל יום שני וחמישי',
    'כל שני וחמישי',
    'בימי שני וחמישי',
    'בימים שני וחמישי',
    "כל יום ב' וה'",
    "בימים ב' וה'",
    'כל יום שני ויום חמישי',
    'כל יום שני וביום חמישי',
    'כל שני ו-חמישי',
    'כל שני, חמישי'
  ])('%s: Monday and Thursday, from the next Monday', (phrase) => {
    expect(fields(`חוג ציור ${phrase}`), phrase).toEqual({
      title: 'חוג ציור',
      scheduledFor: '2026-10-05',
      recurrence: MON_THU
    });
  });

  it('Sunday and Wednesday said on a Sunday: from Wednesday (strictly after today)', () => {
    expect(fields('להשקות כל ראשון ורביעי')).toEqual({
      title: 'להשקות',
      scheduledFor: '2026-10-07',
      recurrence: SUN_WED
    });
    expect(fields('להשקות כל ראשון ורביעי', WED).scheduledFor).toBe('2026-10-11');
  });

  it('the chip names the days and the first date', () => {
    expect(chip(parse('להשקות כל ראשון ורביעי'))).toMatchObject({
      key: 'recurrence:כל ראשון ורביעי',
      value: SUN_WED,
      label: 'בימים א׳ וד׳ · יום ד׳ 7/10',
      alsoSets: { scheduledFor: '2026-10-07' }
    });
    expect(chip(parse('חוג כל יום שני וחמישי'))?.label).toBe('בימים ב׳ וה׳ · יום ב׳ 5/10');
  });

  it('three days, in any order', () => {
    expect(fields('ריצה כל ראשון, שלישי וחמישי').recurrence).toEqual({
      freq: 'weekly',
      weekdays: [0, 2, 4]
    });
    expect(fields('ריצה כל חמישי ושני').recurrence).toEqual(MON_THU);
    expect(chip(parse('ריצה כל ראשון, שלישי וחמישי'))?.label).toBe(
      'בימים א׳, ג׳ וה׳ · יום ג׳ 6/10'
    );
  });

  it('"בימי שלישי" alone is weekly on Tuesdays (like "כל יום שלישי")', () => {
    expect(fields('חוג בימי שלישי')).toEqual({
      title: 'חוג',
      scheduledFor: '2026-10-06',
      recurrence: { freq: 'weekly' }
    });
  });

  it('with an interval: "כל שבועיים בימי שני וחמישי"', () => {
    expect(fields('ניקיון כל שבועיים בימי שני וחמישי')).toEqual({
      title: 'ניקיון',
      scheduledFor: '2026-10-05',
      recurrence: { freq: 'weekly', interval: 2, weekdays: [1, 4] }
    });
    expect(chip(parse('ניקיון כל שבועיים בימי שני וחמישי'))?.label).toBe(
      'כל שבועיים בימים ב׳ וה׳ · יום ב׳ 5/10'
    );
    expect(fields('ניקיון כל שבוע בימי שני וחמישי').recurrence).toEqual(MON_THU);
  });

  it('"פעמיים בשבוע" is consumed with the days it restates', () => {
    expect(fields("חוג פעמיים בשבוע בימים א' וד'")).toEqual({
      title: 'חוג',
      scheduledFor: '2026-10-07',
      recurrence: SUN_WED
    });
    expect(fields('חוג פעמיים בשבוע, בימי שני וחמישי').recurrence).toEqual(MON_THU);
  });

  it('"פעמיים בשבוע" with no days invents none: it stays in the title', () => {
    expect(fields('חוג פעמיים בשבוע')).toEqual({ title: 'חוג פעמיים בשבוע' });
    expect(fields('לנקות פעמיים בשבוע')).toEqual({ title: 'לנקות פעמיים בשבוע' });
  });

  it('a part of day and a time go with the first date', () => {
    expect(chip(parse('להשקות כל שני וחמישי בבוקר'))?.label).toBe(
      'בימים ב׳ וה׳ · יום ב׳ 5/10 בבוקר'
    );
    expect(fields('חוג כל שני וחמישי ב-17:00')).toEqual({
      title: 'חוג',
      scheduledFor: '2026-10-05',
      dueTime: '17:00',
      recurrence: MON_THU
    });
  });

  it('an explicit date still wins scheduledFor', () => {
    expect(fields('חוג כל שני וחמישי, מתחילים ב-20/10')).toMatchObject({
      scheduledFor: '2026-10-20',
      recurrence: MON_THU
    });
  });

  it('dismissing the chip puts the days back in the title and sets nothing', () => {
    const r = parse('חוג כל שני וחמישי', NOW, ['recurrence:כל שני וחמישי']);
    expect(r).toEqual({ title: 'חוג כל שני וחמישי', matches: [] });
  });

  it.each([
    'לבדוק כל שלישי מהמשתתפים',
    'לחלק כל שני ושלישי מהם',
    'בימים האחרונים לסדר',
    'בימים אלה לסדר',
    'ימי הולדת לרשום',
    'כל יום ראשון לחודש לשלם'
  ])('%s: no weekly days', (input) => {
    expect(fields(input).recurrence, input).toBeUndefined();
  });
});
