import { describe, expect, it } from 'vitest';
import { activeWindows, ageStart, isStuck, plan, type PlanInput, type Send } from './planner.ts';
import { isQuietHours } from './time.ts';
import type { ActivityEvent, AddressAs, DeviceToken, Member, NotifyPrefs, Task } from './types.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────────
// Fake clock: every test passes `now` explicitly. Sunday 2026-10-04 is in summer time (UTC+3).

const APP = 'https://eladcdr-del.github.io/tasks-management-app/';
const SUN = (hhmm: string) => new Date(`2026-10-04T${hhmm}:00+03:00`);
const MON = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00+03:00`);
const TODAY = '2026-10-04';
const TOMORROW = '2026-10-05';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Epoch ms of local noon, n days before Sunday 2026-10-04. */
const daysAgo = (n: number) => SUN('12:00').getTime() - n * DAY;

const ALL_ON: NotifyPrefs = { requests: true, reminders: true, partnerDone: true, weekly: true };

function member(
  uid: string,
  displayName: string,
  addressAs: AddressAs,
  notify: Partial<NotifyPrefs> = {}
): Member {
  return {
    uid,
    displayName,
    photoURL: null,
    color: 'sage',
    addressAs,
    role: 'member',
    joinedAt: 0,
    notify: { ...ALL_ON, ...notify },
    inviteCode: null
  };
}

const MICHAL = member('u-michal', 'מיכל', 'f');
const DANI = member('u-dani', 'דני', 'm');
const NOAM = member('u-noam', 'נועם', 'n');

function task(id: string, fields: Partial<Task> = {}): Task {
  return {
    id,
    title: `משימה ${id}`,
    notes: '',
    categoryId: null,
    priority: 'normal',
    ownerId: null,
    requestedBy: null,
    requestedAt: null,
    createdBy: 'u-michal',
    createdAt: daysAgo(2),
    updatedBy: 'u-michal',
    updatedAt: daysAgo(1),
    scheduledFor: null,
    weekPlan: false,
    dueDate: null,
    dueTime: null,
    hardDeadline: false,
    recurrence: null,
    seriesId: null,
    status: 'open',
    snoozeCount: 0,
    lastSnoozedAt: null,
    completedAt: null,
    completedBy: null,
    completion: null,
    ...fields
  };
}

function ev(
  id: string,
  type: ActivityEvent['type'],
  actorId: string,
  createdAt: number,
  extra: Partial<ActivityEvent> = {}
): ActivityEvent {
  return {
    id,
    type,
    actorId,
    taskId: null,
    taskTitle: null,
    targetId: null,
    createdAt,
    push: 'pending',
    ...extra
  };
}

function device(uid: string, n = 1): DeviceToken {
  return {
    deviceId: `${uid}-d${n}`,
    householdId: 'hh',
    token: `tok-${uid}-${n}`,
    userAgent: 'test',
    createdAt: 0,
    updatedAt: 0
  };
}

/** A jar that is full right now (a fill event in these tests is newer than its start). */
const JAR_FULL = {
  treat: 'ארוחה במסעדה',
  target: 10,
  count: 10,
  round: 1,
  startedAt: daysAgo(30)
};

function input(over: Partial<PlanInput> = {}): PlanInput {
  const members = over.members ?? [MICHAL, DANI];
  return {
    now: SUN('09:00'),
    household: {
      id: 'hh',
      name: 'הבית שלנו',
      memberIds: members.map((m) => m.uid),
      memberCount: members.length,
      maxMembers: 6,
      createdBy: 'u-michal',
      createdAt: 0,
      jar: JAR_FULL,
      invite: null
    },
    members,
    tasks: [],
    events: [],
    devicesByUid: Object.fromEntries(members.map((m) => [m.uid, [device(m.uid)]])),
    ...over
  };
}

const ofType = (sends: Send[], type: Send['type']) => sends.filter((s) => s.type === type);
const forUid = (sends: Send[], uid: string) => sends.filter((s) => s.uid === uid);

// ── requested ─────────────────────────────────────────────────────────────────────────────────────

describe('requested', () => {
  const parcel = task('t-parcel', {
    title: 'לאסוף חבילה מהדואר',
    ownerId: 'u-michal',
    requestedBy: 'u-dani'
  });
  const req = ev('e1', 'requested', 'u-dani', SUN('08:50').getTime(), {
    taskId: 't-parcel',
    taskTitle: 'לאסוף חבילה מהדואר',
    targetId: 'u-michal'
  });

  it('goes to the target with the actor’s gendered phrase and the task as body', () => {
    const out = plan(input({ tasks: [parcel], events: [req] }));
    expect(out.sends).toEqual([
      {
        keys: ['ev:e1:u-michal'],
        uid: 'u-michal',
        type: 'requested',
        title: 'דני ביקש ממך משימה',
        body: 'לאסוף חבילה מהדואר',
        url: `${APP}#/task/t-parcel`,
        tag: 'req:e1',
        eventIds: ['e1']
      }
    ]);
    expect(out.eventMarks).toEqual([{ eventId: 'e1', push: 'sent' }]);
  });

  it('uses the female and neutral forms', () => {
    const toDani = task('t2', { title: 'לקנות חלב', ownerId: 'u-dani' });
    const fromMichal = ev('e2', 'requested', 'u-michal', SUN('08:00').getTime(), {
      taskId: 't2',
      taskTitle: 'לקנות חלב',
      targetId: 'u-dani'
    });
    expect(plan(input({ tasks: [toDani], events: [fromMichal] })).sends[0]?.title).toBe(
      'מיכל ביקשה ממך משימה'
    );
    const fromNoam = { ...fromMichal, actorId: 'u-noam' };
    const out = plan(input({ members: [MICHAL, DANI, NOAM], tasks: [toDani], events: [fromNoam] }));
    expect(out.sends[0]?.title).toBe('נועם ביקש/ה ממך משימה');
  });

  it('falls back to the task title when the event has none', () => {
    const out = plan(input({ tasks: [parcel], events: [{ ...req, taskTitle: null }] }));
    expect(out.sends[0]?.body).toBe('לאסוף חבילה מהדואר');
  });

  it.each([
    [
      'the target is the actor',
      { events: [{ ...req, targetId: 'u-dani' }], tasks: [{ ...parcel, ownerId: 'u-dani' }] }
    ],
    ['there is no target', { events: [{ ...req, targetId: null }] }],
    [
      'the target turned requests off',
      { members: [member('u-michal', 'מיכל', 'f', { requests: false }), DANI] }
    ],
    ['the target has no devices', { devicesByUid: { 'u-dani': [device('u-dani')] } }],
    ['the target is not a member any more', { members: [DANI] }],
    ['the task is done or deleted (not open)', { tasks: [] }],
    ['the task was released or reassigned', { tasks: [{ ...parcel, ownerId: null }] }],
    [
      'the request is older than 7 days',
      { events: [{ ...req, createdAt: SUN('09:00').getTime() - 7 * DAY - 1 }] }
    ]
  ] as [string, Partial<PlanInput>][])('is skipped when %s', (_label, over) => {
    const out = plan(input({ tasks: [parcel], events: [req], ...over }));
    expect(out.sends).toEqual([]);
    expect(out.eventMarks).toEqual([{ eventId: 'e1', push: 'skipped' }]);
  });
});

// ── completed / jar_filled ────────────────────────────────────────────────────────────────────────

describe('completed', () => {
  const done = (id: string, actor: string, title: string, at = SUN('08:30').getTime()) =>
    ev(id, 'completed', actor, at, { taskId: `t-${id}`, taskTitle: title });

  it('tells every OTHER member, never the actor', () => {
    const out = plan(
      input({ members: [MICHAL, DANI, NOAM], events: [done('e1', 'u-michal', 'להוריד את הזבל')] })
    );
    expect(out.sends.map((s) => s.uid).sort()).toEqual(['u-dani', 'u-noam']);
    for (const s of out.sends) {
      expect(s.title).toBe('מיכל סיימה: להוריד את הזבל');
      expect(s.body).toBe('עוד משימה ירדה מהרשימה');
      expect(s.url).toBe(`${APP}#/task/t-e1`);
      expect(s.keys).toEqual([`ev:e1:${s.uid}`]);
      expect(s.tag).toBe('done:e1');
    }
    expect(out.eventMarks).toEqual([{ eventId: 'e1', push: 'sent' }]);
  });

  it('uses the male and neutral forms', () => {
    expect(plan(input({ events: [done('e1', 'u-dani', 'לתקן את הברז')] })).sends[0]?.title).toBe(
      'דני סיים: לתקן את הברז'
    );
    const out = plan(
      input({ members: [MICHAL, NOAM], events: [done('e1', 'u-noam', 'לתקן את הברז')] })
    );
    expect(out.sends[0]?.title).toBe('נועם סיים/ה: לתקן את הברז');
  });

  it('coalesces one actor’s completions in a run into one push per recipient', () => {
    const events = [
      done('e3', 'u-michal', 'לקנות חלב', SUN('08:40').getTime()),
      done('e1', 'u-michal', 'להוריד את הזבל', SUN('08:10').getTime()),
      done('e2', 'u-michal', 'לשלם חשמל', SUN('08:20').getTime())
    ];
    const out = plan(input({ events }));
    expect(out.sends).toEqual([
      {
        keys: ['ev:e1:u-dani', 'ev:e2:u-dani', 'ev:e3:u-dani'],
        uid: 'u-dani',
        type: 'completed',
        title: 'מיכל סיימה 3 משימות',
        body: 'להוריד את הזבל, לשלם חשמל, לקנות חלב',
        url: `${APP}#/`,
        tag: 'done:e1',
        eventIds: ['e1', 'e2', 'e3']
      }
    ]);
    expect(out.eventMarks.map((m) => m.push)).toEqual(['sent', 'sent', 'sent']);
  });

  it('lists at most three titles, then "ועוד N"', () => {
    const events = ['א', 'ב', 'ג', 'ד', 'ה'].map((t, i) =>
      done(`e${i}`, 'u-dani', `משימה ${t}`, SUN('08:00').getTime() + i)
    );
    const s = plan(input({ events })).sends[0];
    expect(s?.title).toBe('דני סיים 5 משימות');
    expect(s?.body).toBe('משימה א, משימה ב, משימה ג ועוד 2');
    const four = plan(input({ events: events.slice(0, 4) })).sends[0];
    expect(four?.body).toBe('משימה א, משימה ב, משימה ג ועוד משימה אחת');
  });

  it('does not coalesce different actors', () => {
    const out = plan(
      input({
        members: [MICHAL, DANI, NOAM],
        events: [done('e1', 'u-michal', 'א'), done('e2', 'u-dani', 'ב')]
      })
    );
    expect(forUid(out.sends, 'u-noam').map((s) => s.title)).toEqual([
      'מיכל סיימה: א',
      'דני סיים: ב'
    ]);
    expect(forUid(out.sends, 'u-michal').map((s) => s.title)).toEqual(['דני סיים: ב']);
    expect(forUid(out.sends, 'u-dani').map((s) => s.title)).toEqual(['מיכל סיימה: א']);
  });

  it('skips events older than 24 hours as stale (24h exactly is still fresh)', () => {
    const now = SUN('09:00');
    const fresh = done('e1', 'u-michal', 'טרי', now.getTime() - 24 * HOUR);
    const stale = done('e2', 'u-michal', 'ישן', now.getTime() - 24 * HOUR - 1);
    const out = plan(input({ now, events: [stale, fresh] }));
    expect(out.sends.map((s) => s.title)).toEqual(['מיכל סיימה: טרי']);
    expect(out.eventMarks).toEqual([
      { eventId: 'e2', push: 'skipped' },
      { eventId: 'e1', push: 'sent' }
    ]);
  });

  it('is skipped when no other member has partnerDone on (or a device)', () => {
    const off = plan(
      input({
        members: [MICHAL, member('u-dani', 'דני', 'm', { partnerDone: false })],
        events: [done('e1', 'u-michal', 'א')]
      })
    );
    expect(off.sends).toEqual([]);
    expect(off.eventMarks).toEqual([{ eventId: 'e1', push: 'skipped' }]);
    const noDevice = plan(
      input({
        devicesByUid: { 'u-michal': [device('u-michal')] },
        events: [done('e1', 'u-michal', 'א')]
      })
    );
    expect(noDevice.sends).toEqual([]);
    expect(noDevice.eventMarks).toEqual([{ eventId: 'e1', push: 'skipped' }]);
  });

  it('is skipped when the task is open again (the completion was undone)', () => {
    const out = plan(input({ tasks: [task('t-e1')], events: [done('e1', 'u-michal', 'א')] }));
    expect(out.sends).toEqual([]);
    expect(out.eventMarks).toEqual([{ eventId: 'e1', push: 'skipped' }]);
  });
});

describe('jar_filled', () => {
  const jar = ev('j1', 'jar_filled', 'u-michal', SUN('08:30').getTime(), {
    taskId: 't1',
    taskTitle: 'לקנות חלב'
  });

  it('follows the partner-done path with the jar copy', () => {
    const out = plan(input({ events: [jar] }));
    expect(out.sends).toEqual([
      {
        keys: ['ev:j1:u-dani'],
        uid: 'u-dani',
        type: 'jar_filled',
        title: 'הצנצנת התמלאה!',
        body: 'הגיע הזמן ל: ארוחה במסעדה',
        url: `${APP}#/jar`,
        tag: 'jar:j1',
        eventIds: ['j1']
      }
    ]);
    expect(out.eventMarks).toEqual([{ eventId: 'j1', push: 'sent' }]);
  });

  it('is not coalesced with completions and has a fallback when the treat is blank', () => {
    const base = input();
    const out = plan({
      ...base,
      household: { ...base.household, jar: { ...JAR_FULL, treat: '  ' } },
      events: [
        jar,
        ev('e1', 'completed', 'u-michal', SUN('08:30').getTime(), {
          taskId: 't1',
          taskTitle: 'לקנות חלב'
        })
      ]
    });
    expect(out.sends.map((s) => [s.type, s.title, s.body])).toEqual([
      ['completed', 'מיכל סיימה: לקנות חלב', 'עוד משימה ירדה מהרשימה'],
      ['jar_filled', 'הצנצנת התמלאה!', 'הגיע הזמן לפינוק שקבעתם']
    ]);
  });

  it('is stale after 24 hours too', () => {
    const out = plan(
      input({ events: [{ ...jar, createdAt: SUN('09:00').getTime() - 25 * HOUR }] })
    );
    expect(out.sends).toEqual([]);
    expect(out.eventMarks).toEqual([{ eventId: 'j1', push: 'skipped' }]);
  });

  it('is skipped when the completing task is open again (undone), sent when it has no taskId', () => {
    const undone = plan(input({ tasks: [task('t1')], events: [jar] }));
    expect(undone.sends).toEqual([]);
    expect(undone.eventMarks).toEqual([{ eventId: 'j1', push: 'skipped' }]);
    const noTask = plan(input({ tasks: [task('t1')], events: [{ ...jar, taskId: null }] }));
    expect(noTask.sends.map((s) => s.type)).toEqual(['jar_filled']);
  });

  describe('checks the jar as it is now (the app writes fills with taskId null)', () => {
    const fill = { ...jar, taskId: null, taskTitle: null };
    const withJar = (j: PlanInput['household']['jar']) => {
      const base = input({ events: [fill] });
      return plan({ ...base, household: { ...base.household, jar: j } });
    };

    it.each([
      ['the filling completion was undone (back to 9 of 10)', { ...JAR_FULL, count: 9 }],
      [
        'the treat was already redeemed (a new round started after the fill)',
        { ...JAR_FULL, count: 0, round: 2, startedAt: SUN('08:45').getTime() }
      ],
      ['the jar is gone', null]
    ] as [string, PlanInput['household']['jar']][])('is skipped when %s', (_label, j) => {
      const out = withJar(j);
      expect(out.sends).toEqual([]);
      expect(out.eventMarks).toEqual([{ eventId: 'j1', push: 'skipped' }]);
    });

    it('is sent while the jar is still full in the same round, surplus included', () => {
      expect(withJar(JAR_FULL).sends.map((s) => s.type)).toEqual(['jar_filled']);
      expect(withJar({ ...JAR_FULL, count: 11 }).sends.map((s) => s.type)).toEqual(['jar_filled']);
    });
  });
});

describe('event housekeeping', () => {
  it('settles pending events of other types as skipped and ignores non-pending events', () => {
    const out = plan(
      input({
        events: [
          ev('x1', 'snoozed', 'u-michal', SUN('08:00').getTime()),
          ev('x2', 'completed', 'u-michal', SUN('08:00').getTime(), {
            push: 'sent',
            taskTitle: 'כבר נשלח'
          })
        ]
      })
    );
    expect(out.sends).toEqual([]);
    expect(out.eventMarks).toEqual([{ eventId: 'x1', push: 'skipped' }]);
  });
});

// ── quiet hours ───────────────────────────────────────────────────────────────────────────────────

describe('quiet hours (22:00–07:30)', () => {
  const late = ev('e1', 'completed', 'u-michal', SUN('21:50').getTime() - DAY, {
    taskId: 't1',
    taskTitle: 'א'
  });
  // a completion at 21:50 on Saturday, seen through Saturday night into Sunday morning
  const sat = (hhmm: string) => new Date(`2026-10-03T${hhmm}:00+03:00`);

  it.each([
    ['22:00 (start)', sat('22:00')],
    ['23:30', sat('23:30')],
    ['03:00', SUN('03:00')],
    ['07:29 (last quiet minute)', SUN('07:29')]
  ])('keeps event pushes pending at %s: no send, no mark', (_label, now) => {
    const out = plan(input({ now, events: [late] }));
    expect(out).toEqual({ sends: [], eventMarks: [] });
  });

  it('sends them at 07:30 (9h40m later, still fresh)', () => {
    const out = plan(input({ now: SUN('07:30'), events: [late] }));
    expect(out.sends.map((s) => s.title)).toEqual(['מיכל סיימה: א']);
    expect(out.eventMarks).toEqual([{ eventId: 'e1', push: 'sent' }]);
  });

  it('still sends at 21:59', () => {
    const e = { ...late, createdAt: sat('21:00').getTime() };
    expect(plan(input({ now: sat('21:59'), events: [e] })).sends).toHaveLength(1);
  });

  it('defers requests too', () => {
    const t = task('t1', { ownerId: 'u-michal' });
    const r = ev('r1', 'requested', 'u-dani', sat('23:00').getTime(), {
      taskId: 't1',
      targetId: 'u-michal'
    });
    expect(plan(input({ now: sat('23:10'), tasks: [t], events: [r] }))).toEqual({
      sends: [],
      eventMarks: []
    });
    expect(plan(input({ now: SUN('07:30'), tasks: [t], events: [r] })).sends).toHaveLength(1);
  });
});

// ── due-day morning ───────────────────────────────────────────────────────────────────────────────

describe('due-day (08:00–22:00)', () => {
  const mine = task('t-arnona', { title: 'לשלם ארנונה', ownerId: 'u-michal', dueDate: TODAY });
  const open = task('t-dentist', {
    title: 'לקבוע תור לרופא שיניים',
    ownerId: null,
    dueDate: TODAY
  });

  it.each([
    ['07:59', false],
    ['08:00', true],
    ['11:59', true],
    ['12:00', true],
    ['19:00', true],
    ['21:59', true],
    ['22:00', false]
  ])('window at %s → %s', (hhmm, expected) => {
    expect(ofType(plan(input({ now: SUN(hhmm), tasks: [mine] })).sends, 'due').length > 0).toBe(
      expected
    );
  });

  it('goes to the owner only, with a deterministic key per task, date and recipient', () => {
    const out = plan(input({ tasks: [mine] }));
    expect(out.sends).toEqual([
      {
        keys: [`due:t-arnona:${TODAY}:u-michal`],
        uid: 'u-michal',
        type: 'due',
        title: 'להיום: לשלם ארנונה',
        body: 'מחכה ברשימה של היום',
        url: `${APP}#/task/t-arnona`,
        tag: `due:${TODAY}`,
        eventIds: []
      }
    ]);
    expect(out.eventMarks).toEqual([]);
  });

  it('fans an unassigned task out to every member', () => {
    const out = plan(input({ members: [MICHAL, DANI, NOAM], tasks: [open] }));
    expect(out.sends.map((s) => s.uid)).toEqual(['u-dani', 'u-michal', 'u-noam']);
    expect(out.sends[0]?.title).toBe('להיום: לקבוע תור לרופא שיניים');
    expect(out.sends[0]?.body).toBe('עוד לא נלקחה');
    expect(out.sends.map((s) => s.keys[0])).toEqual([
      `due:t-dentist:${TODAY}:u-dani`,
      `due:t-dentist:${TODAY}:u-michal`,
      `due:t-dentist:${TODAY}:u-noam`
    ]);
  });

  it('coalesces per recipient into "N משימות להיום" with every key', () => {
    const timed = task('t-call', {
      title: 'להתקשר לבנק',
      ownerId: 'u-michal',
      dueDate: TODAY,
      dueTime: '10:00'
    });
    const out = plan(input({ tasks: [mine, open, timed] }));
    const michal = forUid(out.sends, 'u-michal');
    expect(michal).toEqual([
      {
        keys: [
          `due:t-call:${TODAY}:u-michal`,
          `due:t-dentist:${TODAY}:u-michal`,
          `due:t-arnona:${TODAY}:u-michal`
        ],
        uid: 'u-michal',
        type: 'due',
        title: '3 משימות להיום',
        body: 'להתקשר לבנק, לקבוע תור לרופא שיניים, לשלם ארנונה',
        url: `${APP}#/`,
        tag: `due:${TODAY}`,
        eventIds: []
      }
    ]);
    expect(forUid(out.sends, 'u-dani').map((s) => s.title)).toEqual([
      'להיום: לקבוע תור לרופא שיניים'
    ]);
  });

  it('shows the time and the hard deadline in a single reminder', () => {
    const t = task('t1', {
      title: 'להחזיר מכנסיים',
      ownerId: 'u-dani',
      dueDate: TODAY,
      dueTime: '17:00',
      hardDeadline: true
    });
    expect(plan(input({ tasks: [t] })).sends[0]?.body).toBe('עד השעה 17:00 · מועד אחרון');
  });

  it('respects reminders=off and ignores other dates and done tasks', () => {
    const out = plan(
      input({
        members: [member('u-michal', 'מיכל', 'f', { reminders: false }), DANI],
        tasks: [
          mine,
          open,
          task('t-tomorrow', { ownerId: 'u-dani', dueDate: TOMORROW }),
          task('t-planned', { ownerId: 'u-dani', scheduledFor: TODAY }),
          task('t-done', { ownerId: 'u-dani', dueDate: TODAY, status: 'done' })
        ]
      })
    );
    expect(out.sends.map((s) => [s.uid, s.keys])).toEqual([
      ['u-dani', [`due:t-dentist:${TODAY}:u-dani`]]
    ]);
  });
});

describe('due-day morning: timed plans (no due date, a time, planned for today)', () => {
  const pickup = task('t-pickup', {
    title: 'לאסוף את נועה מחוג',
    ownerId: 'u-michal',
    scheduledFor: TODAY,
    dueTime: '17:30'
  });

  it('reminds the owner with "היום ב-17:30: {title}" (no "עד השעה": it is a plan, not a deadline)', () => {
    expect(plan(input({ tasks: [pickup] })).sends).toEqual([
      {
        keys: [`due:t-pickup:${TODAY}:u-michal`],
        uid: 'u-michal',
        type: 'due',
        title: 'היום ב-17:30: לאסוף את נועה מחוג',
        body: 'מחכה ברשימה של היום',
        url: `${APP}#/task/t-pickup`,
        tag: `due:${TODAY}`,
        eventIds: []
      }
    ]);
  });

  it('fans out when unassigned, and joins the due summary in time order', () => {
    const open = task('t-pickup', { ...pickup, ownerId: null });
    const one = plan(input({ tasks: [open] })).sends;
    expect(one.map((s) => [s.uid, s.title, s.body])).toEqual([
      ['u-dani', 'היום ב-17:30: לאסוף את נועה מחוג', 'עוד לא נלקחה'],
      ['u-michal', 'היום ב-17:30: לאסוף את נועה מחוג', 'עוד לא נלקחה']
    ]);
    const bank = task('t-bank', {
      title: 'להתקשר לבנק',
      ownerId: 'u-michal',
      dueDate: TODAY,
      dueTime: '10:00'
    });
    const both = forUid(plan(input({ tasks: [pickup, bank] })).sends, 'u-michal');
    expect(both.map((s) => [s.title, s.body, s.keys])).toEqual([
      [
        '2 משימות להיום',
        'להתקשר לבנק, לאסוף את נועה מחוג',
        [`due:t-bank:${TODAY}:u-michal`, `due:t-pickup:${TODAY}:u-michal`]
      ]
    ]);
  });

  it('needs all three: no due date, a time, and today as the plan', () => {
    const out = plan(
      input({
        tasks: [
          task('no-time', { ownerId: 'u-dani', scheduledFor: TODAY }),
          task('tomorrow', { ownerId: 'u-dani', scheduledFor: TOMORROW, dueTime: '09:00' }),
          task('missed', { ownerId: 'u-dani', scheduledFor: '2026-10-03', dueTime: '09:00' }),
          task('later-due', {
            ownerId: 'u-dani',
            scheduledFor: TODAY,
            dueDate: TOMORROW,
            dueTime: '09:00'
          })
        ]
      })
    );
    expect(out.sends).toEqual([]);
  });

  it('is outside its window like any due reminder', () => {
    expect(plan(input({ now: SUN('07:59'), tasks: [pickup] })).sends).toEqual([]);
    expect(plan(input({ now: SUN('22:00'), tasks: [pickup] })).sends).toEqual([]);
  });
});

describe('due-day morning: week plans', () => {
  it('a week plan never gets the timed-plan reminder (its date is a week, not a day)', () => {
    const weekPlan = task('t-week', {
      ownerId: 'u-dani',
      scheduledFor: TODAY,
      weekPlan: true,
      dueTime: '10:00'
    });
    expect(plan(input({ tasks: [weekPlan] })).sends).toEqual([]);
  });

  it('a week plan with no time and no due date gets nothing either', () => {
    const weekPlan = task('t-week', { ownerId: 'u-dani', scheduledFor: TODAY, weekPlan: true });
    expect(plan(input({ tasks: [weekPlan] })).sends).toEqual([]);
  });

  it('a due date today is a deadline, so it is still reminded even on a week-planned task', () => {
    const form = task('t-form', {
      title: 'להגיש טופס',
      ownerId: 'u-dani',
      scheduledFor: '2026-10-10',
      weekPlan: true,
      dueDate: TODAY
    });
    expect(plan(input({ tasks: [form] })).sends.map((s) => s.title)).toEqual(['להיום: להגיש טופס']);
  });
});

describe('a task owned by a former member is treated as unassigned', () => {
  const orphan = task('t-orphan', {
    title: 'לשלם חשבון חשמל',
    ownerId: 'u-gone', // left the household: no member doc
    dueDate: TODAY
  });

  it('the due reminder goes to every current member, as "עוד לא נלקחה"', () => {
    const out = plan(input({ tasks: [orphan] }));
    expect(out.sends.map((s) => [s.uid, s.title, s.body, s.keys[0]])).toEqual([
      ['u-dani', 'להיום: לשלם חשבון חשמל', 'עוד לא נלקחה', `due:t-orphan:${TODAY}:u-dani`],
      ['u-michal', 'להיום: לשלם חשבון חשמל', 'עוד לא נלקחה', `due:t-orphan:${TODAY}:u-michal`]
    ]);
  });

  it('respects reminders=off for the members it fans out to', () => {
    const out = plan(
      input({
        members: [member('u-michal', 'מיכל', 'f', { reminders: false }), DANI],
        tasks: [orphan]
      })
    );
    expect(out.sends.map((s) => s.uid)).toEqual(['u-dani']);
  });

  it('the evening-before reminder fans out too', () => {
    const hard = task('t-orphan', { ...orphan, dueDate: TOMORROW, hardDeadline: true });
    const out = plan(input({ now: SUN('19:00'), tasks: [hard] }));
    expect(out.sends.map((s) => s.uid)).toEqual(['u-dani', 'u-michal']);
  });

  it('a stuck orphan is in every member’s weekly nudge', () => {
    const stuck = task('t-orphan', { ...orphan, dueDate: null, createdAt: daysAgo(30) });
    const out = plan(input({ now: SUN('10:30'), tasks: [stuck] }));
    expect(out.sends.map((s) => [s.uid, s.type, s.body])).toEqual([
      ['u-dani', 'weekly', 'לשלם חשבון חשמל'],
      ['u-michal', 'weekly', 'לשלם חשבון חשמל']
    ]);
  });
});

// ── day before a hard deadline ────────────────────────────────────────────────────────────────────

describe('day-before hard deadline (18:00–22:00)', () => {
  const shirt = task('t-shirt', {
    title: 'להחזיר את החולצה לקניון',
    ownerId: 'u-dani',
    dueDate: TOMORROW,
    hardDeadline: true
  });

  it.each([
    ['17:59', false],
    ['18:00', true],
    ['21:30', true],
    ['21:59', true],
    ['22:00', false]
  ])('window at %s → %s', (hhmm, expected) => {
    expect(plan(input({ now: SUN(hhmm), tasks: [shirt] })).sends.length > 0).toBe(expected);
  });

  it('reminds the owner with "מחר אחרון"', () => {
    const out = plan(input({ now: SUN('18:30'), tasks: [shirt] }));
    expect(out.sends).toEqual([
      {
        keys: [`eve:t-shirt:${TOMORROW}:u-dani`],
        uid: 'u-dani',
        type: 'eve',
        title: 'מחר אחרון: להחזיר את החולצה לקניון',
        body: 'נשאר עוד יום',
        url: `${APP}#/task/t-shirt`,
        tag: `eve:${TOMORROW}`,
        eventIds: []
      }
    ]);
  });

  it('needs a hard deadline tomorrow (not a soft one, not today)', () => {
    const out = plan(
      input({
        now: SUN('19:00'),
        tasks: [
          task('soft', { ownerId: 'u-dani', dueDate: TOMORROW }),
          task('today', { ownerId: 'u-dani', dueDate: TODAY, hardDeadline: true }),
          task('later', { ownerId: 'u-dani', dueDate: '2026-10-06', hardDeadline: true })
        ]
      })
    );
    expect(ofType(out.sends, 'eve')).toEqual([]);
  });

  it('fans out when unassigned and coalesces per recipient', () => {
    const gift = task('t-gift', {
      title: 'לקנות מתנה',
      ownerId: null,
      dueDate: TOMORROW,
      hardDeadline: true,
      dueTime: '12:00'
    });
    const out = plan(input({ now: SUN('20:00'), tasks: [shirt, gift] }));
    expect(forUid(out.sends, 'u-dani').map((s) => [s.title, s.body, s.keys])).toEqual([
      [
        'מחר אחרון: 2 משימות',
        'לקנות מתנה, להחזיר את החולצה לקניון',
        [`eve:t-gift:${TOMORROW}:u-dani`, `eve:t-shirt:${TOMORROW}:u-dani`]
      ]
    ]);
    expect(forUid(out.sends, 'u-michal').map((s) => [s.title, s.body])).toEqual([
      ['מחר אחרון: לקנות מתנה', 'נשאר עוד יום · מחר עד השעה 12:00']
    ]);
  });
});

// ── weekly nudge ──────────────────────────────────────────────────────────────────────────────────

describe('weekly nudge (Sunday 10:00–22:00)', () => {
  const acDani = task('t-ac', {
    title: 'לברר על מזגן חדש',
    ownerId: 'u-dani',
    createdAt: daysAgo(50),
    snoozeCount: 4
  });
  const shelfOpen = task('t-shelf', { title: 'לתלות מדף', ownerId: null, createdAt: daysAgo(30) });
  const formMichal = task('t-form', {
    title: 'למלא טופס 106',
    ownerId: 'u-michal',
    createdAt: daysAgo(3),
    snoozeCount: 3
  });

  it.each([
    ['Sunday 09:59', SUN('09:59'), false],
    ['Sunday 10:00', SUN('10:00'), true],
    ['Sunday 12:59', SUN('12:59'), true],
    ['Sunday 13:00', SUN('13:00'), true],
    ['Sunday 21:59', SUN('21:59'), true],
    ['Sunday 22:00', SUN('22:00'), false],
    ['Monday 10:30', MON('10:30'), false]
  ])('window at %s → %s', (_label, now, expected) => {
    expect(ofType(plan(input({ now, tasks: [acDani] })).sends, 'weekly').length > 0).toBe(expected);
  });

  it('nudges each member about stuck tasks they own or nobody owns', () => {
    const out = plan(input({ now: SUN('10:30'), tasks: [acDani, shelfOpen, formMichal] }));
    expect(out.sends).toEqual([
      {
        keys: ['wk:2026-W40:u-dani'],
        uid: 'u-dani',
        type: 'weekly',
        title: 'יש 2 משימות שמחכות כבר זמן מה',
        body: 'לברר על מזגן חדש, לתלות מדף',
        url: `${APP}#/`,
        tag: 'wk:2026-W40',
        eventIds: []
      },
      {
        keys: ['wk:2026-W40:u-michal'],
        uid: 'u-michal',
        type: 'weekly',
        title: 'יש 2 משימות שמחכות כבר זמן מה',
        body: 'לתלות מדף, למלא טופס 106',
        url: `${APP}#/`,
        tag: 'wk:2026-W40',
        eventIds: []
      }
    ]);
  });

  it('singular copy links to the task; more than three titles end with "ועוד"', () => {
    const one = plan(input({ now: SUN('11:00'), members: [DANI], tasks: [acDani] })).sends[0];
    expect(one?.title).toBe('יש משימה אחת שמחכה כבר זמן מה');
    expect(one?.body).toBe('לברר על מזגן חדש');
    expect(one?.url).toBe(`${APP}#/task/t-ac`);
    const many = [1, 2, 3, 4, 5].map((n) =>
      task(`s${n}`, { title: `תקועה ${n}`, ownerId: 'u-dani', createdAt: daysAgo(60 - n) })
    );
    const s = plan(input({ now: SUN('11:00'), members: [DANI], tasks: many })).sends[0];
    expect(s?.title).toBe('יש 5 משימות שמחכות כבר זמן מה');
    expect(s?.body).toBe('תקועה 1, תקועה 2, תקועה 3 ועוד 2');
  });

  it('respects weekly=off and sends nothing without stuck tasks', () => {
    const off = plan(
      input({
        now: SUN('10:30'),
        members: [member('u-dani', 'דני', 'm', { weekly: false })],
        tasks: [acDani]
      })
    );
    expect(off.sends).toEqual([]);
    const none = plan(input({ now: SUN('10:30'), tasks: [task('fresh', { ownerId: 'u-dani' })] }));
    expect(none.sends).toEqual([]);
  });
});

// ── catch-up: GitHub's schedule can leave hours between runs ─────────────────────────────────────

describe('catch-up after a run-less stretch', () => {
  const arnona = task('t-arnona', { title: 'לשלם ארנונה', ownerId: 'u-michal', dueDate: TODAY });
  const shirt = task('t-shirt', {
    title: 'להחזיר את החולצה לקניון',
    ownerId: 'u-dani',
    dueDate: TOMORROW,
    hardDeadline: true
  });
  const ac = task('t-ac', { title: 'לברר על מזגן חדש', ownerId: 'u-dani', createdAt: daysAgo(50) });
  const all = [arnona, shirt, ac];
  const keysAt = (now: Date, tasks = all) =>
    plan(input({ now, tasks }))
      .sends.map((s) => `${s.type} ${[...s.keys].sort().join(',')}`)
      .sort();

  it('a real sparse Sunday (runs at 07:49, 14:25, 18:13, 21:24) still delivers every reminder', () => {
    expect(keysAt(SUN('07:49'))).toEqual([]);
    const afternoon = keysAt(SUN('14:25'));
    expect(afternoon).toEqual([`due due:t-arnona:${TODAY}:u-michal`, 'weekly wk:2026-W40:u-dani']);
    const evening = keysAt(SUN('18:13'));
    expect(evening).toEqual([...afternoon, `eve eve:t-shirt:${TOMORROW}:u-dani`].sort());
    // later runs re-plan the very same keys, so the sent/{key} dedupe lets each out only once
    expect(keysAt(SUN('21:24'))).toEqual(evening);
  });

  it('the evening cutoff is 22:00, where quiet hours begin; the next morning nothing is owed', () => {
    expect(keysAt(SUN('21:59'))).toHaveLength(3);
    expect(keysAt(SUN('22:00'))).toEqual([]);
    expect(keysAt(MON('07:30'))).toEqual([]); // arnona was due yesterday, shirt is due today (no eve)
    expect(keysAt(MON('07:59'))).toEqual([]);
  });

  it('after 12:00 only tasks that existed by noon are caught up; in the morning new ones join', () => {
    const at = (hhmm: string) => SUN(hhmm).getTime();
    const morning = task('t-morning', {
      ownerId: 'u-michal',
      dueDate: TODAY,
      createdAt: at('09:00')
    });
    const noonish = task('t-1159', { ownerId: 'u-michal', dueDate: TODAY, createdAt: at('11:59') });
    const afternoon = task('t-pm', { ownerId: 'u-michal', dueDate: TODAY, createdAt: at('12:00') });
    const timedPm = task('t-plan-pm', {
      ownerId: 'u-michal',
      scheduledFor: TODAY,
      dueTime: '20:00',
      createdAt: at('15:00')
    });
    const tasks = [arnona, morning, noonish, afternoon, timedPm];
    expect(keysAt(SUN('11:00'), [arnona, morning])).toEqual([
      `due due:t-arnona:${TODAY}:u-michal,due:t-morning:${TODAY}:u-michal`
    ]);
    expect(keysAt(SUN('16:00'), tasks)).toEqual([
      `due due:t-1159:${TODAY}:u-michal,due:t-arnona:${TODAY}:u-michal,due:t-morning:${TODAY}:u-michal`
    ]);
    // a task added in the afternoon alone sets off no push
    expect(keysAt(SUN('16:00'), [afternoon, timedPm])).toEqual([]);
  });

  it('keeps the noon rule on the wall clock across the fall-back DST change (Sun 25 Oct, UTC+2)', () => {
    const day = '2026-10-25';
    const ist = (hhmm: string) => new Date(`${day}T${hhmm}:00+02:00`);
    const due = (id: string, createdAt: number) =>
      task(id, { ownerId: 'u-michal', dueDate: day, createdAt });
    // 09:30Z is 11:30 local after the change (it would be 12:30 in summer time)
    const tasks = [due('t-old', daysAgo(2)), due('t-1130', Date.parse(`${day}T09:30:00Z`))];
    const late = due('t-1200', Date.parse(`${day}T10:00:00Z`)); // 12:00 local
    const keys = (now: Date) =>
      ofType(plan(input({ now, tasks: [...tasks, late] })).sends, 'due').map((s) => s.keys);
    expect(keys(ist('07:59'))).toEqual([]);
    expect(keys(ist('08:00'))).toHaveLength(1);
    expect(keys(ist('21:59'))).toEqual([
      [`due:t-1130:${day}:u-michal`, `due:t-old:${day}:u-michal`]
    ]);
    expect(keys(ist('22:00'))).toEqual([]);
    // the same Sunday's weekly nudge is caught up until 21:59 local too
    const weekly = (now: Date) =>
      ofType(plan(input({ now, tasks: [ac] })).sends, 'weekly').map((s) => s.keys);
    expect(weekly(ist('21:59'))).toEqual([['wk:2026-W43:u-dani']]);
    expect(weekly(ist('22:00'))).toEqual([]);
  });

  it('opens on the local wall clock after the spring-forward change too (Fri 27 Mar, UTC+3)', () => {
    const day = '2026-03-27';
    const t = task('t-x', { ownerId: 'u-dani', dueDate: day, createdAt: daysAgo(200) });
    const sends = (iso: string) => plan(input({ now: new Date(iso), tasks: [t] })).sends.length;
    expect(sends('2026-03-27T04:59:00Z')).toBe(0); // 07:59 IDT
    expect(sends('2026-03-27T05:00:00Z')).toBe(1); // 08:00 IDT (06:00 the day before, UTC+2)
    expect(sends('2026-03-27T18:59:00Z')).toBe(1); // 21:59 IDT
    expect(sends('2026-03-27T19:00:00Z')).toBe(0); // 22:00 IDT
  });

  it('no reminder window ever reaches into quiet hours', () => {
    for (let m = 0; m < 24 * 60; m++) {
      for (const weekday of [0, 1]) {
        const parts = {
          iso: TODAY,
          hour: Math.floor(m / 60),
          minute: m % 60,
          weekday,
          isoWeek: ''
        };
        const w = activeWindows(parts);
        if (isQuietHours(parts)) expect([w.due, w.eve, w.weekly]).toEqual([false, false, false]);
      }
    }
  });
});

describe('stuck rule', () => {
  it('one-off: 21 calendar days open is stuck, 20 is not', () => {
    expect(isStuck(task('a', { createdAt: daysAgo(21) }), TODAY)).toBe(true);
    expect(isStuck(task('a', { createdAt: daysAgo(20) }), TODAY)).toBe(false);
  });

  it('counts calendar days in Jerusalem (created 23:30 local = that day)', () => {
    const created = new Date('2026-09-13T23:30:00+03:00').getTime(); // 2026-09-13 local, 20:30Z
    expect(ageStart(task('a', { createdAt: created }))).toBe('2026-09-13');
    expect(isStuck(task('a', { createdAt: created }), TODAY)).toBe(true); // 21 days
    const nextDay = new Date('2026-09-14T00:30:00+03:00').getTime(); // still 13 Sep in UTC
    expect(isStuck(task('a', { createdAt: nextDay }), TODAY)).toBe(false); // 20 days
  });

  it('snoozed 3+ times is stuck even when new; 2 is not', () => {
    expect(isStuck(task('a', { snoozeCount: 3 }), TODAY)).toBe(true);
    expect(isStuck(task('a', { snoozeCount: 2 }), TODAY)).toBe(false);
  });

  it('a task planned or due in the future is waiting, not stuck', () => {
    const old = { createdAt: daysAgo(60), snoozeCount: 5 };
    expect(isStuck(task('a', { ...old, scheduledFor: TOMORROW }), TODAY)).toBe(false);
    expect(isStuck(task('a', { ...old, dueDate: TOMORROW }), TODAY)).toBe(false);
    expect(isStuck(task('a', { ...old, dueDate: TOMORROW, scheduledFor: TODAY }), TODAY)).toBe(
      true
    ); // min() is today
    expect(isStuck(task('a', { ...old, scheduledFor: TODAY }), TODAY)).toBe(true);
  });

  it('a recurring instance ages from its own date, not from its creation', () => {
    const series = { seriesId: 'ser1', createdAt: daysAgo(40) };
    expect(isStuck(task('r', { ...series, dueDate: '2026-09-29' }), TODAY)).toBe(false); // 5 days
    expect(isStuck(task('r', { ...series, dueDate: '2026-09-13' }), TODAY)).toBe(true); // 21 days
    expect(isStuck(task('r', { ...series, dueDate: '2026-10-20' }), TODAY)).toBe(false); // not yet due
    expect(isStuck(task('r', { ...series, scheduledFor: '2026-09-29' }), TODAY)).toBe(false);
    // a one-off with the same dates DOES count from creation
    expect(isStuck(task('o', { createdAt: daysAgo(40), dueDate: '2026-09-29' }), TODAY)).toBe(true);
  });

  it('done tasks are never stuck', () => {
    expect(isStuck(task('a', { createdAt: daysAgo(90), status: 'done' }), TODAY)).toBe(false);
  });
});

// ── cross-cutting ─────────────────────────────────────────────────────────────────────────────────

describe('cross-cutting rules', () => {
  /** A busy Sunday at 10:30: every kind of item at once, three members. */
  function busy(): PlanInput {
    const at = SUN('10:00').getTime();
    return input({
      now: SUN('10:30'),
      members: [MICHAL, DANI, NOAM],
      tasks: [
        task('t-req', { ownerId: 'u-noam' }),
        task('t-due', { ownerId: null, dueDate: TODAY }),
        task('t-ac', { ownerId: 'u-dani', createdAt: daysAgo(50) }),
        task('t-x', { ownerId: 'u-michal', snoozeCount: 3 })
      ],
      events: [
        ev('e-req', 'requested', 'u-michal', at, {
          taskId: 't-req',
          targetId: 'u-noam',
          taskTitle: 'בקשה'
        }),
        ev('e-d1', 'completed', 'u-dani', at, { taskId: 'd1', taskTitle: 'א' }),
        ev('e-d2', 'completed', 'u-noam', at + 1, { taskId: 'd2', taskTitle: 'ב' }),
        ev('e-jar', 'jar_filled', 'u-noam', at + 2)
      ]
    });
  }

  it('never notifies the actor about their own action', () => {
    const inp = busy();
    const out = plan(inp);
    for (const s of out.sends) {
      for (const id of s.eventIds) {
        expect(s.uid).not.toBe(inp.events.find((e) => e.id === id)?.actorId);
      }
    }
    expect(out.sends.filter((s) => s.eventIds.length > 0)).toHaveLength(1 + 2 + 2 + 2);
  });

  it('members without devices get nothing, but events are still settled', () => {
    const inp = { ...busy(), devicesByUid: {} };
    const out = plan(inp);
    expect(out.sends).toEqual([]);
    expect(out.eventMarks.map((m) => m.push)).toEqual(['skipped', 'skipped', 'skipped', 'skipped']);
  });

  it('is deterministic and independent of input order', () => {
    const a = plan(busy());
    expect(plan(busy())).toEqual(a);
    const shuffled = busy();
    shuffled.members.reverse();
    shuffled.tasks.reverse();
    shuffled.events.reverse();
    expect(plan(shuffled)).toEqual(a);
  });

  it('keys follow the documented formats', () => {
    const keys = plan(busy()).sends.flatMap((s) => s.keys);
    for (const k of keys) {
      expect(k).toMatch(
        /^(ev:[^:]+:u-\w+|due:[^:]+:\d{4}-\d{2}-\d{2}:u-\w+|eve:[^:]+:\d{4}-\d{2}-\d{2}:u-\w+|wk:\d{4}-W\d{2}:u-\w+)$/
      );
      expect(k).not.toContain('/'); // valid Firestore document id
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not mutate its input', () => {
    const inp = busy();
    const before = structuredClone(inp);
    plan(inp);
    expect(inp).toEqual(before);
  });

  it('plans nothing on an empty household', () => {
    expect(plan(input({ members: [], devicesByUid: {} }))).toEqual({ sends: [], eventMarks: [] });
  });
});
