import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '$lib/parser/quickAdd';
import { draftFromParse, listRows } from './listRows';

// Sunday 4 Oct 2026, 09:00 in Jerusalem: "מחר" = Mon 5 Oct, "יום חמישי" = Thu 8 Oct.
const NOW = new Date('2026-10-04T09:00:00+03:00');
const TZ = 'Asia/Jerusalem';

describe('listRows', () => {
  it('one row per cleaned line, each parsed like a single quick add', () => {
    const { rows, overflow } = listRows(
      '1. להשקות עציצים\n2. לתקן את הברז מחר דחוף\n☐ להחזיר מכנסיים עד יום חמישי',
      NOW,
      TZ
    );
    expect(overflow).toEqual([]);
    expect(rows.map((r) => r.title)).toEqual(['להשקות עציצים', 'לתקן את הברז', 'להחזיר מכנסיים']);
    expect(rows[0]!.matches).toEqual([]);
    expect(rows[0]!.draft).toEqual({
      title: 'להשקות עציצים',
      scheduledFor: null,
      weekPlan: false,
      dueDate: null,
      dueTime: null,
      hardDeadline: false,
      priority: 'normal',
      categoryId: null,
      recurrence: null,
      ownerId: null
    });
    expect(rows[1]!.matches.map((m) => m.kind)).toEqual(
      expect.arrayContaining(['category', 'date', 'priority'])
    );
    expect(rows[1]!.draft).toMatchObject({
      scheduledFor: '2026-10-05',
      priority: 'urgent',
      categoryId: 'home'
    });
    expect(rows[2]!.draft).toMatchObject({
      dueDate: '2026-10-08',
      hardDeadline: true,
      categoryId: 'returns'
    });
  });

  it('never names an owner, whatever the line says', () => {
    const { rows } = listRows('דני יתקן את הברז\nמיכל תאסוף חבילה\nאני אקנה חלב', NOW, TZ);
    expect(rows.every((r) => r.draft.ownerId === null)).toBe(true);
  });

  it('keys rows by the cleaned line', () => {
    const { rows } = listRows('- לקנות נורות מחר\n- לתקן מדף מחר', NOW, TZ);
    expect(rows.map((r) => r.key)).toEqual(['לקנות נורות מחר', 'לתקן מדף מחר']);
    expect(rows.map((r) => r.item.lines)).toEqual([[0], [1]]);
    expect(rows[0]!.draft).toMatchObject({ title: 'לקנות נורות', scheduledFor: '2026-10-05' });
  });

  it('a repeat and a week plan come through as in the single quick add', () => {
    const { rows } = listRows('להשקות עציצים כל שבוע\nלסדר את המחסן השבוע', NOW, TZ);
    expect(rows[0]!.draft.recurrence).toEqual({ freq: 'weekly' });
    expect(rows[1]!.draft).toMatchObject({ weekPlan: true, scheduledFor: '2026-10-10' });
  });

  it('returns the lines past the cap as overflow', () => {
    const raw = Array.from({ length: 5 }, (_, i) => `משימה ${i + 1}`).join('\n');
    const { rows, overflow } = listRows(raw, NOW, TZ, 3);
    expect(rows).toHaveLength(3);
    expect(overflow.map((i) => i.text)).toEqual(['משימה 4', 'משימה 5']);
  });

  it('an empty box has no rows', () => {
    expect(listRows('', NOW, TZ)).toEqual({ rows: [], overflow: [] });
  });
});

describe('draftFromParse', () => {
  it('drops a hard deadline without a due date and a week plan without a date', () => {
    const parsed = { ...parseQuickAdd('משהו', NOW, TZ), hardDeadline: true, weekPlan: true };
    expect(draftFromParse(parsed, 'משהו')).toMatchObject({
      hardDeadline: false,
      weekPlan: false,
      scheduledFor: null
    });
  });

  it('falls back to the line when the parse leaves no title', () => {
    const parsed = { ...parseQuickAdd('מחר', NOW, TZ), title: '  ' };
    expect(draftFromParse(parsed, 'מחר').title).toBe('מחר');
  });

  it('copies the recurrence instead of sharing the parse result’s object', () => {
    const parsed = parseQuickAdd('לשלם ארנונה כל חודש', NOW, TZ);
    const draft = draftFromParse(parsed, 'לשלם ארנונה כל חודש');
    expect(draft.recurrence).toEqual(parsed.recurrence);
    expect(draft.recurrence).not.toBe(parsed.recurrence);
  });
});
