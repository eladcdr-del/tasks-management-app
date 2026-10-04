import { describe, expect, it } from 'vitest';
import type { Task } from '$lib/domain/types';
import { groupByMonth } from './group';

const done = (id: string, iso: string) =>
  ({ id, completedAt: Date.parse(iso), updatedAt: Date.parse(iso) }) as Task;

describe('groupByMonth', () => {
  it('groups by completion month in Asia/Jerusalem, newest first', () => {
    const groups = groupByMonth([
      done('a', '2026-08-03T10:00:00+03:00'),
      done('b', '2026-10-01T10:00:00+03:00'),
      done('c', '2026-08-31T23:30:00+03:00'),
      // 30 Sep 22:30 UTC is already 1 October in Israel
      done('d', '2026-09-30T22:30:00Z')
    ]);
    expect(groups.map((g) => g.label)).toEqual(['אוקטובר 2026', 'אוגוסט 2026']);
    expect(groups[0]?.tasks.map((t) => t.id)).toEqual(['b', 'd']);
    expect(groups[1]?.tasks.map((t) => t.id)).toEqual(['c', 'a']);
  });
});
