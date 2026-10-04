import { describe, expect, it } from 'vitest';
import type { ActivityEvent, Member } from '$lib/domain/types';
import { buildHistory, eventTime } from './history';

const members: Record<string, Pick<Member, 'displayName' | 'addressAs'>> = {
  michal: { displayName: 'מיכל', addressAs: 'f' },
  dani: { displayName: 'דני', addressAs: 'm' }
};
const lookup = (uid: string | null | undefined) => (uid ? (members[uid] ?? null) : null);

const T0 = Date.parse('2026-10-01T09:00:00+03:00');
let n = 0;
const ev = (type: ActivityEvent['type'], actorId: string, min: number, targetId: string | null = null): ActivityEvent => ({
  id: `e${++n}`,
  type,
  actorId,
  taskId: 't1',
  taskTitle: 'x',
  targetId,
  createdAt: T0 + min * 60_000,
  push: 'none'
});

const task = {
  id: 't1',
  createdBy: 'michal',
  createdAt: T0,
  status: 'open' as const,
  completedBy: null,
  completedAt: null
};

describe('buildHistory', () => {
  it('tells the story in natural, gendered Hebrew, oldest first', () => {
    const events = [
      ev('taken', 'dani', 30),
      ev('requested', 'michal', 1, 'dani'),
      ev('created', 'michal', 0)
    ];
    expect(buildHistory(task, events, lookup).map((i) => i.text)).toEqual([
      'מיכל הוסיפה',
      'מיכל ביקשה מדני',
      'דני לקח'
    ]);
  });

  it('collapses a run of edits by the same person', () => {
    const events = [ev('edited', 'michal', 3), ev('edited', 'michal', 2), ev('created', 'michal', 0)];
    const items = buildHistory(task, events, lookup);
    expect(items.map((i) => i.text)).toEqual(['מיכל הוסיפה', 'מיכל עדכנה']);
  });

  it('rebuilds created / completed when the event window lost them', () => {
    const done = { ...task, status: 'done' as const, completedBy: 'dani', completedAt: T0 + 3_600_000 };
    expect(buildHistory(done, [], lookup).map((i) => i.text)).toEqual(['מיכל הוסיפה', 'דני סיים']);
  });

  it('names an unknown actor gently', () => {
    expect(buildHistory({ ...task, createdBy: 'gone' }, [], lookup)[0]?.text).toBe('מישהו הוסיף/ה');
  });
});

describe('eventTime', () => {
  it('says today / yesterday, else the date, with the local time', () => {
    expect(eventTime(T0, '2026-10-01')).toBe('היום · 09:00');
    expect(eventTime(T0, '2026-10-02')).toBe('אתמול · 09:00');
    expect(eventTime(T0, '2026-10-10')).toBe('1 באוקטובר · 09:00');
  });
});
