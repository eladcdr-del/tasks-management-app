// M5: the chip API the QuickAdd sheet (3.3) builds on: stable keys, field/value/label per match,
// one due chip that carries "hard", and the `dismissed` option that is applied before field
// selection so fields, hardDeadline and title always agree.
import { describe, expect, it } from 'vitest';
import {
  deletePhraseFromInput,
  parseQuickAdd,
  rebuildTitle,
  removeMatch,
  type ParseMatch,
  type ParseResult
} from './quickAdd';

/** Sunday 2026-10-04, 09:00 in Asia/Jerusalem. */
const NOW = new Date('2026-10-04T06:00:00Z');

const parse = (input: string, dismissed: string[] = []): ParseResult =>
  parseQuickAdd(input, NOW, 'Asia/Jerusalem', { dismissed });

const chip = (r: ParseResult, kind: ParseMatch['kind']): ParseMatch | undefined =>
  r.matches.find((m) => m.kind === kind);

describe('every match carries key, field, value and a Hebrew label', () => {
  it('date and category', () => {
    const input = 'לקחת את האוטו למוסך מחר';
    expect(parse(input).matches).toEqual([
      {
        kind: 'category',
        start: 14,
        end: 19,
        text: 'למוסך',
        key: 'category:למוסך',
        field: 'categoryId',
        value: 'car',
        label: 'רכב'
      },
      {
        kind: 'date',
        start: 20,
        end: 23,
        text: 'מחר',
        key: 'date:מחר',
        field: 'scheduledFor',
        value: '2026-10-05',
        label: 'מחר · יום ב׳ 5/10'
      }
    ]);
  });

  it('due (with hard), time, priority and recurrence', () => {
    const r = parse('דחוף! להחזיר חולצה עד יום חמישי בשעה 17:30 כל שבוע');
    expect(chip(r, 'priority')).toMatchObject({
      key: 'priority:דחוף!',
      field: 'priority',
      value: 'urgent',
      label: 'דחוף'
    });
    expect(chip(r, 'due')).toMatchObject({
      key: 'due:עד יום חמישי',
      field: 'dueDate',
      value: '2026-10-08',
      label: 'עד יום ה׳ 8/10',
      hard: true
    });
    expect(chip(r, 'time')).toMatchObject({
      key: 'time:בשעה 17:30',
      field: 'dueTime',
      value: '17:30',
      label: '17:30'
    });
    expect(chip(r, 'recurrence')).toMatchObject({
      key: 'recurrence:כל שבוע',
      field: 'recurrence',
      value: { freq: 'weekly' },
      label: 'כל שבוע'
    });
    expect(chip(r, 'category')).toMatchObject({ value: 'returns', label: 'החזרות והחלפות' });
  });

  it('labels: today, a weekday this week, a later date, another year, high, monthly, yearly', () => {
    expect(chip(parse('לסדר היום'), 'date')?.label).toBe('היום · יום א׳ 4/10');
    expect(chip(parse('לסדר בשבת'), 'date')?.label).toBe('שבת 10/10');
    expect(chip(parse('לסדר ב-15/10'), 'date')?.label).toBe('יום ה׳ 15/10');
    expect(chip(parse('לסדר ב-3/1'), 'date')?.label).toBe('יום א׳ 3/1/27');
    expect(chip(parse('לסדר עד מחר'), 'due')?.label).toBe('עד מחר · יום ב׳ 5/10');
    expect(chip(parse('חשוב לסדר'), 'priority')?.label).toBe('חשוב');
    expect(chip(parse('לשלם כל חודש'), 'recurrence')?.label).toBe('כל חודש');
    expect(chip(parse('לחדש כל שנה'), 'recurrence')?.label).toBe('כל שנה');
  });

  it('a time with no date shows the date it implies, and carries it in alsoSets', () => {
    expect(chip(parse('להתקשר בשעה 17:30'), 'time')).toMatchObject({
      label: 'היום 17:30',
      alsoSets: { scheduledFor: '2026-10-04' }
    });
    expect(chip(parse('להתקשר ב-8:00'), 'time')).toMatchObject({
      label: 'מחר 08:00',
      alsoSets: { scheduledFor: '2026-10-05' }
    });
    expect(chip(parse('להתקשר מחר ב-8:00'), 'time')?.alsoSets).toBeUndefined();
  });

  it('a recurring weekday carries its first date', () => {
    expect(chip(parse('חוג כל יום שלישי'), 'recurrence')).toMatchObject({
      key: 'recurrence:כל יום שלישי',
      value: { freq: 'weekly' },
      label: 'כל שבוע · יום ג׳ 6/10',
      alsoSets: { scheduledFor: '2026-10-06' }
    });
  });
});

describe('"מועד אחרון" is a modifier of the one due chip', () => {
  it('with "עד" elsewhere: one due chip, hard, with the extra span', () => {
    const input = 'מועד אחרון: לשלם ארנונה עד 15/10';
    const r = parse(input);
    const dues = r.matches.filter((m) => m.kind === 'due');
    expect(dues).toHaveLength(1);
    expect(dues[0]).toMatchObject({
      key: 'due:עד 15/10',
      value: '2026-10-15',
      hard: true,
      extra: [{ start: 0, end: 10, text: 'מועד אחרון' }]
    });
    expect(r.title).toBe('לשלם ארנונה');
    expect(r.hardDeadline).toBe(true);
  });

  it('with a plain date elsewhere: that date becomes the due chip', () => {
    const r = parse('מועד אחרון לשלם ארנונה 15/10');
    expect(r.matches.filter((m) => m.kind === 'due')).toHaveLength(1);
    expect(chip(r, 'due')).toMatchObject({
      key: 'due:15/10',
      field: 'dueDate',
      value: '2026-10-15',
      label: 'עד יום ה׳ 15/10',
      hard: true
    });
    expect(chip(r, 'date')).toBeUndefined();
  });

  it('introducing the date itself: one chip', () => {
    const r = parse('מועד אחרון 15/10 לשלם');
    expect(r.matches.filter((m) => m.kind === 'due')).toEqual([
      expect.objectContaining({ key: 'due:מועד אחרון 15/10', hard: true, text: 'מועד אחרון 15/10' })
    ]);
  });

  it('alone: no chip, the words stay in the title (a hard deadline needs a date)', () => {
    const r = parse('מועד אחרון לשלם ארנונה');
    expect(chip(r, 'due')).toBeUndefined();
    expect(r.title).toBe('מועד אחרון לשלם ארנונה');
  });

  it('a category-derived hardDeadline shows on the due chip', () => {
    expect(chip(parse('להחזיר מכנסיים עד יום חמישי'), 'due')?.hard).toBe(true);
    expect(chip(parse('להחזיר ספר עד יום חמישי'), 'due')?.hard).toBeUndefined();
  });
});

describe('keys are stable while the user types elsewhere', () => {
  it('ignores offsets, spacing, hyphens and niqqud', () => {
    const keys = [
      'לקנות חלב מחר',
      'לקנות חלב ולחם מחר',
      'מחר לקנות חלב',
      'לקנות   חלב    מחר  !!',
      'לקנות חלב מ\u{5B8}חר'
    ].map((input) => chip(parse(input), 'date')?.key);
    expect(new Set(keys)).toEqual(new Set(['date:מחר']));
    expect(chip(parse('לסדר עד  יום-חמישי'), 'due')?.key).toBe('due:עד יום חמישי');
  });
});

describe('dismissed chips', () => {
  it('lets the next candidate take over: dismissing מחר makes Tuesday the date', () => {
    const input = 'מחר או ביום שלישי';
    const r = parse(input, ['date:מחר']);
    expect(r.scheduledFor).toBe('2026-10-06');
    expect(r.title).toBe('מחר או');
    expect(r.matches.map((m) => m.key)).toEqual(['date:ביום שלישי']);
  });

  it('the dismissed text stays in the title and gives no other chip', () => {
    const r = parse('לנקות ביום שלישי בשבוע הבא', ['date:ביום שלישי בשבוע הבא']);
    expect(r.scheduledFor).toBeUndefined();
    expect(r.title).toBe('לנקות ביום שלישי בשבוע הבא');
    expect(r.matches).toEqual([]);
  });

  it('dismissing the category chip clears the hardDeadline it derived', () => {
    const input = 'להחזיר חולצה עד יום חמישי';
    const r = parse(input, ['category:להחזיר']);
    expect(r.categoryId).toBeUndefined();
    expect(r.hardDeadline).toBeUndefined();
    expect(r.dueDate).toBe('2026-10-08');
    expect(chip(r, 'due')?.hard).toBeUndefined();
  });

  it('dismissing a hard due chip drops the date, the flag and the "מועד אחרון" text together', () => {
    for (const [input, key] of [
      ['מועד אחרון: לשלם ארנונה עד 15/10', 'due:עד 15/10'],
      ['מועד אחרון לשלם ארנונה 15/10', 'due:15/10']
    ] as const) {
      const r = parse(input, [key]);
      expect(r.dueDate, input).toBeUndefined();
      expect(r.scheduledFor, input).toBeUndefined();
      expect(r.hardDeadline, input).toBeUndefined();
      expect(r.title, input).toBe(input);
    }
  });

  it('dismissing the "מועד אחרון" flag keeps the plain date', () => {
    const r = parse('מועד אחרון לשלם ארנונה', ['due:מועד אחרון']);
    expect(r.hardDeadline).toBeUndefined();
    expect(r.title).toBe('מועד אחרון לשלם ארנונה');
  });

  it('dismissing a time drops the date it implied', () => {
    const r = parse('להתקשר בשעה 17:30', ['time:בשעה 17:30']);
    expect(r).toEqual({ title: 'להתקשר בשעה 17:30', matches: [] });
  });

  it('dismissing a recurring weekday drops its first date too', () => {
    const r = parse('חוג כל יום שלישי', ['recurrence:כל יום שלישי']);
    expect(r).toEqual({ title: 'חוג כל יום שלישי', matches: [] });
  });

  it('dismissing a priority leaves "סופר" out of the category hunt', () => {
    const r = parse('סופר דחוף לסדר', ['priority:סופר דחוף']);
    expect(r.priority).toBeUndefined();
    expect(r.categoryId).toBeUndefined();
    expect(r.title).toBe('סופר דחוף לסדר');
  });

  it('dismissing a specific noun does not hand the category to a weak returns verb', () => {
    const r = parse('להחליף מצבר', ['category:מצבר']);
    expect(r.categoryId).toBeUndefined();
  });

  it('unknown keys are ignored', () => {
    expect(parse('לסדר מחר', ['date:מחרתיים', 'nonsense']).scheduledFor).toBe('2026-10-05');
  });

  it('the default options are no dismissed chips', () => {
    expect(parseQuickAdd('לסדר מחר', NOW)).toEqual(parse('לסדר מחר'));
    expect(parseQuickAdd('לסדר מחר', NOW, 'Asia/Jerusalem', {})).toEqual(parse('לסדר מחר'));
  });
});

describe('deletePhraseFromInput (formerly removeMatch)', () => {
  it('is also exported under its old name', () => {
    expect(removeMatch).toBe(deletePhraseFromInput);
  });

  it('deletes a hard due chip together with its detached "מועד אחרון"', () => {
    const input = 'מועד אחרון: לשלם ארנונה עד 15/10';
    const due = chip(parse(input), 'due');
    expect(due).toBeDefined();
    if (due) {
      const left = deletePhraseFromInput(input, due);
      expect(left).toBe('לשלם ארנונה');
      expect(parse(left).hardDeadline).toBeUndefined();
    }
  });

  it('skips a stale extra span', () => {
    expect(
      deletePhraseFromInput('לשלם עד מחר', {
        start: 5,
        end: 11,
        text: 'עד מחר',
        extra: [{ start: 0, end: 4, text: 'זזזז' }]
      })
    ).toBe('לשלם');
  });
});

describe('rebuildTitle', () => {
  it('consumes extra spans too and agrees with the parsed title', () => {
    for (const input of [
      'מועד אחרון: לשלם ארנונה עד 15/10',
      'תזכיר לי מחר לשלם ארנונה',
      'לשלם (עד מחר)'
    ]) {
      const r = parse(input);
      expect(rebuildTitle(input, r.matches)).toBe(r.title);
    }
  });
});
