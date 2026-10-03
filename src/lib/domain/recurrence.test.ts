import { describe, expect, it } from 'vitest';
import { buildNextInstance, nextOccurrence, nextTaskId } from './recurrence';
import type { RecurrenceFreq, Task } from './types';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'task1',
    title: 'להשקות עציצים',
    notes: 'את אלה שבמרפסת',
    categoryId: 'home',
    priority: 'high',
    ownerId: 'u1',
    requestedBy: null,
    requestedAt: null,
    createdBy: 'u1',
    createdAt: 1_000,
    updatedBy: 'u1',
    updatedAt: 2_000,
    scheduledFor: null,
    dueDate: null,
    dueTime: null,
    hardDeadline: false,
    recurrence: { freq: 'weekly' },
    seriesId: null,
    status: 'open',
    snoozeCount: 0,
    lastSnoozedAt: null,
    completedAt: null,
    completedBy: null,
    completion: null,
    ...over
  };
}
const rec = (freq: RecurrenceFreq) => ({ recurrence: { freq } });

describe('nextOccurrence', () => {
  describe('weekly', () => {
    it('adds 7 days to the due date', () => {
      expect(nextOccurrence(task({ dueDate: '2026-10-08' }), '2026-10-08')).toBe('2026-10-15');
    });

    it('is based on the due date, not on the day it was completed (completed early)', () => {
      expect(nextOccurrence(task({ dueDate: '2026-10-08' }), '2026-10-06')).toBe('2026-10-15');
    });

    it('uses scheduledFor when there is no due date', () => {
      expect(nextOccurrence(task({ scheduledFor: '2026-10-06' }), '2026-10-06')).toBe('2026-10-13');
    });

    it('prefers dueDate over scheduledFor when both exist', () => {
      expect(
        nextOccurrence(task({ dueDate: '2026-10-08', scheduledFor: '2026-10-06' }), '2026-10-06')
      ).toBe('2026-10-15');
    });

    it('falls back to the completion date when the task has no dates', () => {
      expect(nextOccurrence(task(), '2026-10-04')).toBe('2026-10-11');
    });

    it('rolls forward until strictly after the completion date (completed late)', () => {
      // due Thu 10-01, finished Sun 10-11: +7 = 10-08 is already past, so 10-15
      expect(nextOccurrence(task({ dueDate: '2026-10-01' }), '2026-10-11')).toBe('2026-10-15');
    });

    it('a next date equal to the completion date is not "after": it rolls one more step', () => {
      expect(nextOccurrence(task({ dueDate: '2026-10-01' }), '2026-10-08')).toBe('2026-10-15');
    });

    it('keeps the weekday even a year late', () => {
      // 2025-10-01 is a Wednesday; first Wednesday after Sun 2026-10-04 is 10-07
      expect(nextOccurrence(task({ dueDate: '2025-10-01' }), '2026-10-04')).toBe('2026-10-07');
    });

    it('crosses the DST transitions without shifting a day', () => {
      expect(nextOccurrence(task({ dueDate: '2026-03-26' }), '2026-03-26')).toBe('2026-04-02');
      expect(nextOccurrence(task({ dueDate: '2026-10-22' }), '2026-10-22')).toBe('2026-10-29');
      expect(nextOccurrence(task({ dueDate: '2026-10-25' }), '2026-10-25')).toBe('2026-11-01');
    });
  });

  describe('monthly (clamps the day to the month length)', () => {
    const monthly = (dueDate: string) => task({ ...rec('monthly'), dueDate });

    it('keeps the day of month', () => {
      expect(nextOccurrence(monthly('2026-10-15'), '2026-10-15')).toBe('2026-11-15');
    });

    it('Jan 31 -> Feb 28 in a common year', () => {
      expect(nextOccurrence(monthly('2026-01-31'), '2026-01-31')).toBe('2026-02-28');
    });

    it('Jan 31 -> Feb 29 in a leap year', () => {
      expect(nextOccurrence(monthly('2028-01-31'), '2028-01-31')).toBe('2028-02-29');
    });

    it('31st -> 30th for 30-day months', () => {
      expect(nextOccurrence(monthly('2026-03-31'), '2026-03-31')).toBe('2026-04-30');
    });

    it('rolls December into January', () => {
      expect(nextOccurrence(monthly('2026-12-20'), '2026-12-20')).toBe('2027-01-20');
    });

    it('rolling forward stays anchored to the original day (no drift to the 28th)', () => {
      // 31 Jan monthly, finished 15 May: Feb 28, Mar 31, Apr 30 are all past, May 31 is next
      expect(nextOccurrence(monthly('2026-01-31'), '2026-05-15')).toBe('2026-05-31');
    });

    it('a clamped date equal to the completion date rolls one more month', () => {
      expect(nextOccurrence(monthly('2026-01-31'), '2026-02-28')).toBe('2026-03-31');
    });

    it('works from scheduledFor and from the completion date', () => {
      expect(
        nextOccurrence(task({ ...rec('monthly'), scheduledFor: '2026-10-04' }), '2026-10-04')
      ).toBe('2026-11-04');
      expect(nextOccurrence(task({ ...rec('monthly') }), '2026-10-31')).toBe('2026-11-30');
    });
  });

  describe('yearly', () => {
    const yearly = (dueDate: string) => task({ ...rec('yearly'), dueDate });

    it('adds a year', () => {
      expect(nextOccurrence(yearly('2026-10-15'), '2026-10-15')).toBe('2027-10-15');
    });

    it('Feb 29 -> Feb 28 in the next common year', () => {
      expect(nextOccurrence(yearly('2028-02-29'), '2028-02-29')).toBe('2029-02-28');
    });

    it('rolling forward keeps the Feb 29 anchor for leap years', () => {
      // finished 2029-03-10: 2029-02-28 is past, 2030-02-28 is the next
      expect(nextOccurrence(yearly('2028-02-29'), '2029-03-10')).toBe('2030-02-28');
      // finished just after the 2031 date: 2032 is a leap year again
      expect(nextOccurrence(yearly('2028-02-29'), '2031-03-01')).toBe('2032-02-29');
    });
  });

  it('returns null for a task that does not recur', () => {
    expect(
      nextOccurrence(task({ recurrence: null, dueDate: '2026-10-08' }), '2026-10-08')
    ).toBeNull();
  });
});

describe('nextTaskId', () => {
  it('is the series id and the next date joined by "__" (deterministic, so a retry cannot duplicate)', () => {
    expect(nextTaskId('abc123', '2026-10-15')).toBe('abc123__2026-10-15');
    expect(nextTaskId('abc123', '2026-10-15')).toBe(nextTaskId('abc123', '2026-10-15'));
  });
});

describe('buildNextInstance', () => {
  const NOW = 1_800_000_000_000;
  const done = task({
    id: 'root1',
    dueDate: '2026-10-08',
    dueTime: '17:30',
    hardDeadline: true,
    status: 'done',
    snoozeCount: 2,
    lastSnoozedAt: 1_700_000_000_000,
    requestedBy: 'u2',
    requestedAt: 1_600_000_000_000,
    completedAt: 1_790_000_000_000,
    completedBy: 'u1',
    completion: { note: 'בוצע', cost: 50, place: 'המשתלה', contact: '', photoIds: ['p1'] }
  });

  it('builds the complete next Task', () => {
    expect(buildNextInstance(done, '2026-10-08', NOW, 'u1')).toEqual({
      id: 'root1__2026-10-15',
      title: 'להשקות עציצים',
      notes: 'את אלה שבמרפסת',
      categoryId: 'home',
      priority: 'high',
      ownerId: 'u1',
      requestedBy: null,
      requestedAt: null,
      createdBy: 'u1',
      createdAt: NOW,
      updatedBy: 'u1',
      updatedAt: NOW,
      scheduledFor: null,
      dueDate: '2026-10-15',
      dueTime: '17:30',
      hardDeadline: true,
      recurrence: { freq: 'weekly' },
      seriesId: 'root1',
      status: 'open',
      snoozeCount: 0,
      lastSnoozedAt: null,
      completedAt: null,
      completedBy: null,
      completion: null
    });
  });

  it('the first instance starts the series: seriesId = its own id', () => {
    const next = buildNextInstance(
      task({ id: 'root1', seriesId: null, dueDate: '2026-10-08' }),
      '2026-10-08',
      NOW,
      'u1'
    );
    expect(next?.seriesId).toBe('root1');
    expect(next?.id).toBe('root1__2026-10-15');
  });

  it('later instances keep the series id and derive the id from it, not from their own id', () => {
    const second = task({ id: 'root1__2026-10-15', seriesId: 'root1', dueDate: '2026-10-15' });
    const next = buildNextInstance(second, '2026-10-15', NOW, 'u2');
    expect(next?.seriesId).toBe('root1');
    expect(next?.id).toBe('root1__2026-10-22');
  });

  it('sets dueDate when the source had a dueDate', () => {
    const next = buildNextInstance(task({ dueDate: '2026-10-08' }), '2026-10-08', NOW, 'u1');
    expect(next).toMatchObject({ dueDate: '2026-10-15', scheduledFor: null });
  });

  it('sets scheduledFor when the source only had a soft plan', () => {
    const next = buildNextInstance(task({ scheduledFor: '2026-10-06' }), '2026-10-06', NOW, 'u1');
    expect(next).toMatchObject({ scheduledFor: '2026-10-13', dueDate: null });
  });

  it('with both dates, the dueDate wins and the soft plan is dropped (one date drives a series)', () => {
    const next = buildNextInstance(
      task({ dueDate: '2026-10-08', scheduledFor: '2026-10-06' }),
      '2026-10-06',
      NOW,
      'u1'
    );
    expect(next).toMatchObject({ dueDate: '2026-10-15', scheduledFor: null });
  });

  it('with no dates, plans the next one from the completion date', () => {
    const next = buildNextInstance(task(), '2026-10-04', NOW, 'u1');
    expect(next).toMatchObject({ scheduledFor: '2026-10-11', dueDate: null });
  });

  it("stamps the actor and the clock, not the source task's authors", () => {
    const next = buildNextInstance(
      task({ createdBy: 'u1', updatedBy: 'u1', dueDate: '2026-10-08' }),
      '2026-10-08',
      NOW,
      'u2'
    );
    expect(next).toMatchObject({
      createdBy: 'u2',
      updatedBy: 'u2',
      createdAt: NOW,
      updatedAt: NOW
    });
  });

  it('keeps an unowned series unowned', () => {
    expect(
      buildNextInstance(task({ ownerId: null, dueDate: '2026-10-08' }), '2026-10-08', NOW, 'u1')
        ?.ownerId
    ).toBeNull();
  });

  it('rolls forward for a late completion and the id follows the date', () => {
    const next = buildNextInstance(
      task({ id: 's', dueDate: '2026-10-01' }),
      '2026-10-11',
      NOW,
      'u1'
    );
    expect(next).toMatchObject({ id: 's__2026-10-15', dueDate: '2026-10-15' });
  });

  it('supports monthly clamping end to end', () => {
    const next = buildNextInstance(
      task({ id: 'm', ...rec('monthly'), dueDate: '2026-01-31' }),
      '2026-01-31',
      NOW,
      'u1'
    );
    expect(next).toMatchObject({
      id: 'm__2026-02-28',
      dueDate: '2026-02-28',
      recurrence: { freq: 'monthly' }
    });
  });

  it('does not share the recurrence object with the source, and does not carry client-only flags', () => {
    const source = task({ dueDate: '2026-10-08', pending: true });
    const next = buildNextInstance(source, '2026-10-08', NOW, 'u1');
    expect(next?.recurrence).toEqual(source.recurrence);
    expect(next?.recurrence).not.toBe(source.recurrence);
    expect(next).not.toHaveProperty('pending');
  });

  it('does not mutate the source task', () => {
    const source = task({ dueDate: '2026-10-08' });
    const snapshot = structuredClone(source);
    buildNextInstance(source, '2026-10-08', NOW, 'u1');
    expect(source).toEqual(snapshot);
  });

  it('returns null for a task that does not recur', () => {
    expect(buildNextInstance(task({ recurrence: null }), '2026-10-08', NOW, 'u1')).toBeNull();
  });
});
