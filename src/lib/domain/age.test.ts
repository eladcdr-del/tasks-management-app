import { describe, expect, it } from 'vitest';
import { ageDays, ageDaysFrom, ageStart, isStuck, STUCK_AGE_DAYS, STUCK_SNOOZE_COUNT } from './age';
import { addDays } from './dates';
import { buildNextInstance } from './recurrence';
import type { Task } from './types';

// Fixture clock: Sunday 2026-10-04 09:00 Asia/Jerusalem (+03:00).
const TODAY = '2026-10-04';
const NOW = Date.parse(`${TODAY}T09:00:00+03:00`);

/** createdAt for a task made `n` calendar days before NOW, at the same local time. */
const created = (n: number) => Date.parse(`${addDays(TODAY, -n)}T09:00:00+03:00`);

type AgeFields = Pick<
  Task,
  'status' | 'createdAt' | 'snoozeCount' | 'seriesId' | 'dueDate' | 'scheduledFor'
>;
/** A one-off open task created today with no dates; override what the test is about. */
const t = (over: Partial<AgeFields> = {}): AgeFields => ({
  status: 'open',
  createdAt: created(0),
  snoozeCount: 0,
  seriesId: null,
  dueDate: null,
  scheduledFor: null,
  ...over
});

describe('ageDaysFrom (whole calendar days in Asia/Jerusalem)', () => {
  it('is 0 on the day of creation, whatever the hour', () => {
    expect(ageDaysFrom(created(0), NOW)).toBe(0);
    expect(ageDaysFrom(Date.parse('2026-10-04T00:01:00+03:00'), NOW)).toBe(0);
  });

  it('counts calendar days, not 24-hour blocks', () => {
    expect(ageDaysFrom(created(1), NOW)).toBe(1);
    expect(ageDaysFrom(created(30), NOW)).toBe(30);
    expect(ageDaysFrom(created(400), NOW)).toBe(400);
    // 23:50 two days ago to 00:10 now is only 24h20m of elapsed time but two calendar days
    expect(
      ageDaysFrom(Date.parse('2026-10-02T23:50:00+03:00'), Date.parse('2026-10-04T00:10:00+03:00'))
    ).toBe(2);
  });

  it('is exact across the March spring-forward (a 23-hour day)', () => {
    expect(
      ageDaysFrom(Date.parse('2026-03-26T23:30:00+02:00'), Date.parse('2026-03-28T00:10:00+03:00'))
    ).toBe(2);
    expect(
      ageDaysFrom(Date.parse('2026-03-20T09:00:00+02:00'), Date.parse('2026-03-30T09:00:00+03:00'))
    ).toBe(10);
  });

  it('is exact across the October fall-back (a 25-hour day)', () => {
    expect(
      ageDaysFrom(Date.parse('2026-10-24T23:30:00+03:00'), Date.parse('2026-10-26T00:10:00+02:00'))
    ).toBe(2);
    expect(
      ageDaysFrom(Date.parse('2026-10-20T09:00:00+03:00'), Date.parse('2026-10-30T09:00:00+02:00'))
    ).toBe(10);
  });

  it('accepts a Date for now and never goes negative (clock skew)', () => {
    expect(ageDaysFrom(created(5), new Date(NOW))).toBe(5);
    expect(ageDaysFrom(NOW + 3_600_000, NOW)).toBe(0);
    expect(ageDaysFrom(created(-3), NOW)).toBe(0);
  });

  it('honours an explicit timezone', () => {
    // 22:30Z on Oct 3 is already Oct 4 in Jerusalem (+03:00) but still Oct 3 in Los Angeles (-07:00)
    const c = Date.parse('2026-10-03T22:30:00Z');
    const now = Date.parse('2026-10-04T10:00:00Z');
    expect(ageDaysFrom(c, now, 'Asia/Jerusalem')).toBe(0);
    expect(ageDaysFrom(c, now, 'America/Los_Angeles')).toBe(1);
  });
});

describe('ageStart', () => {
  it('is the creation day for a one-off, whatever its dates', () => {
    expect(ageStart(t({ createdAt: created(10) }))).toBe('2026-09-24');
    expect(ageStart(t({ createdAt: created(10), dueDate: '2026-12-01' }))).toBe('2026-09-24');
  });

  it('is the creation day in the given timezone', () => {
    const c = Date.parse('2026-10-03T22:30:00Z');
    expect(ageStart(t({ createdAt: c }))).toBe('2026-10-04');
    expect(ageStart(t({ createdAt: c }), 'America/Los_Angeles')).toBe('2026-10-03');
  });

  it("is max(creation day, the instance's own date) for a recurring instance", () => {
    const instance = { seriesId: 's1', createdAt: created(25) };
    // own date ahead of creation: age counts from the own date
    expect(ageStart(t({ ...instance, dueDate: '2026-10-14' }))).toBe('2026-10-14');
    expect(ageStart(t({ ...instance, dueDate: '2026-09-20' }))).toBe('2026-09-20');
    // the soft plan is the own date when there is no due date
    expect(ageStart(t({ ...instance, scheduledFor: '2026-09-30' }))).toBe('2026-09-30');
    // own date before creation (an instance created late): creation day
    expect(ageStart(t({ ...instance, dueDate: '2026-09-01' }))).toBe('2026-09-09');
    // no own date at all: creation day
    expect(ageStart(t(instance))).toBe('2026-09-09');
  });

  it('ignores a malformed own date instead of throwing', () => {
    expect(ageStart(t({ seriesId: 's1', createdAt: created(3), dueDate: '2026-13-40' }))).toBe(
      '2026-10-01'
    );
  });
});

describe('ageDays (from ageStart)', () => {
  it('one-offs count from creation', () => {
    expect(ageDays(t({ createdAt: created(30) }), NOW)).toBe(30);
    expect(ageDays(t({ createdAt: created(30), scheduledFor: '2026-12-01' }), new Date(NOW))).toBe(
      30
    );
  });

  it('recurring instances count from their own date, and are 0 while it is ahead', () => {
    expect(ageDays(t({ seriesId: 's', createdAt: created(40), dueDate: '2026-09-24' }), NOW)).toBe(
      10
    );
    expect(ageDays(t({ seriesId: 's', createdAt: created(40), dueDate: '2026-10-14' }), NOW)).toBe(
      0
    );
  });
});

describe('isStuck', () => {
  it('exposes its thresholds', () => {
    expect(STUCK_AGE_DAYS).toBe(21);
    expect(STUCK_SNOOZE_COUNT).toBe(3);
  });

  it('is false for a fresh, never-snoozed task', () => {
    expect(isStuck(t(), NOW)).toBe(false);
  });

  it('becomes true at exactly 21 days open', () => {
    expect(isStuck(t({ createdAt: created(20) }), NOW)).toBe(false);
    expect(isStuck(t({ createdAt: created(21) }), NOW)).toBe(true);
    expect(isStuck(t({ createdAt: created(90) }), NOW)).toBe(true);
  });

  it('becomes true at exactly 3 snoozes', () => {
    expect(isStuck(t({ snoozeCount: 2 }), NOW)).toBe(false);
    expect(isStuck(t({ snoozeCount: 3 }), NOW)).toBe(true);
    expect(isStuck(t({ snoozeCount: 7 }), NOW)).toBe(true);
  });

  it('a finished task is never stuck', () => {
    expect(isStuck(t({ status: 'done', createdAt: created(100), snoozeCount: 9 }), NOW)).toBe(
      false
    );
  });

  describe('requires the task to be actionable (effective date null or <= today)', () => {
    it('a one-off planned 2 months ahead is not stuck, however old or snoozed', () => {
      const planned = t({ createdAt: created(40), scheduledFor: '2026-12-04', snoozeCount: 5 });
      expect(isStuck(planned, NOW)).toBe(false);
    });

    it('a task with a future due date is not stuck; on the due date it can be', () => {
      const old = { createdAt: created(40) };
      expect(isStuck(t({ ...old, dueDate: '2026-10-05' }), NOW)).toBe(false);
      expect(isStuck(t({ ...old, dueDate: TODAY }), NOW)).toBe(true);
      expect(isStuck(t({ ...old, dueDate: '2026-09-01' }), NOW)).toBe(true);
    });

    it('the effective date is the earlier one: a soft plan for today makes it actionable', () => {
      expect(
        isStuck(t({ createdAt: created(40), dueDate: '2026-12-01', scheduledFor: TODAY }), NOW)
      ).toBe(true);
    });

    it('a snoozed-away task (scheduledFor ahead) is not stuck until that day comes', () => {
      const snoozed = t({ createdAt: created(5), snoozeCount: 3, scheduledFor: '2026-10-05' });
      expect(isStuck(snoozed, NOW)).toBe(false);
      expect(isStuck(snoozed, Date.parse('2026-10-05T08:00:00+03:00'))).toBe(true);
    });
  });

  describe('recurring instances', () => {
    it('a monthly ארנונה instance due in 10 days is not stuck (created 25 days ago)', () => {
      expect(
        isStuck(t({ seriesId: 'arnona', createdAt: created(25), dueDate: '2026-10-14' }), NOW)
      ).toBe(false);
    });

    it('it only becomes stuck 21 days after its own due date, not 21 days after it was created', () => {
      const arnona = t({ seriesId: 'arnona', createdAt: created(25), dueDate: '2026-09-14' });
      expect(ageDays(arnona, NOW)).toBe(20);
      expect(isStuck(arnona, NOW)).toBe(false);
      expect(isStuck(arnona, Date.parse('2026-10-05T09:00:00+03:00'))).toBe(true);
    });

    it('a yearly instance created ~11 months ago, due next month: new, not stuck', () => {
      const yearly = t({ seriesId: 'test', createdAt: created(335), dueDate: '2026-11-04' });
      expect(isStuck(yearly, NOW)).toBe(false);
      expect(ageDays(yearly, NOW)).toBe(0); // its date is still ahead: the badge says חדשה
    });

    it('a series completed late: the next instance is fresh from its own date', () => {
      // weekly, due Thu 10-01, finished late on Sun 10-11 -> next instance due 10-15, created 10-11
      const finishedAt = Date.parse('2026-10-11T20:00:00+03:00');
      const source: Task = {
        id: 'water',
        title: 'להשקות',
        notes: '',
        categoryId: null,
        priority: 'normal',
        ownerId: 'u1',
        requestedBy: null,
        requestedAt: null,
        createdBy: 'u1',
        createdAt: created(30),
        updatedBy: 'u1',
        updatedAt: created(30),
        scheduledFor: null,
        weekPlan: false,
        dueDate: '2026-10-01',
        dueTime: null,
        hardDeadline: false,
        recurrence: { freq: 'weekly' },
        seriesId: null,
        status: 'done',
        snoozeCount: 0,
        lastSnoozedAt: null,
        completedAt: finishedAt,
        completedBy: 'u1',
        completion: null
      };
      const next = buildNextInstance(source, '2026-10-11', finishedAt, 'u1') as Task;
      expect(next.dueDate).toBe('2026-10-15');
      const on = (iso: string) => Date.parse(`${iso}T09:00:00+03:00`);
      expect(ageDays(next, on('2026-10-13'))).toBe(0); // before its date
      expect(ageDays(next, on('2026-10-18'))).toBe(3); // counted from 10-15, not 10-11
      expect(isStuck(next, on('2026-11-04'))).toBe(false); // 20 days after its date
      expect(isStuck(next, on('2026-11-05'))).toBe(true);
    });
  });

  it('accepts a Date for now', () => {
    expect(isStuck(t({ createdAt: created(21) }), new Date(NOW))).toBe(true);
  });
});
