import { describe, expect, it } from 'vitest';
import { isStuck } from '../../domain/age';
import { bucketInfo, groupTasks, needsAttention } from '../../domain/buckets';
import { DEFAULT_CATEGORIES } from '../../domain/categories';
import { addDays, diffDays, isoDateAt, todayISO } from '../../domain/dates';
import { buildNextInstance, nextTaskId } from '../../domain/recurrence';
import { pendingRequestOf } from '../../domain/requests';
import { searchDoneTasks } from '../../domain/search';
import type { DemoState } from './store';
import { isDemoState } from './store';
import { imageSize } from './photo';
import {
  createSeed,
  DANI,
  DEMO_HOUSEHOLD_ID,
  DEMO_INVITE_CODE,
  jerusalemInstant,
  MICHAL,
  SEED_RECEIPT_JPEG,
  SEED_RECEIPT_THUMB
} from './seed';

const NOW = new Date('2026-10-04T09:00:00+03:00'); // the E2E clock: Sunday morning
const TODAY = '2026-10-04';

function parts(state: DemoState) {
  const rec = state.households[DEMO_HOUSEHOLD_ID]!;
  const tasks = Object.values(rec.tasks);
  return {
    rec,
    tasks,
    open: tasks.filter((t) => t.status === 'open'),
    done: tasks.filter((t) => t.status === 'done'),
    task: (id: string) => rec.tasks[id]!
  };
}

const seed = createSeed(NOW);
const { rec, tasks, open, done, task } = parts(seed);
const memberIds = rec.household.memberIds;
const base64Bytes = (dataUrl: string) => {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

describe('createSeed: household and people', () => {
  it('is a valid demo state, signed in as מיכל', () => {
    expect(isDemoState(seed)).toBe(true);
    expect(seed.authUid).toBe(MICHAL);
    expect(seed.users[MICHAL]).toMatchObject({
      householdId: DEMO_HOUSEHOLD_ID,
      profile: { displayName: 'מיכל', photoURL: null }
    });
    expect(seed.users[DANI]).toMatchObject({
      householdId: DEMO_HOUSEHOLD_ID,
      profile: { displayName: 'דני', photoURL: null }
    });
  });

  it('has the household "הבית שלנו" with מיכל (owner) and דני', () => {
    expect(rec.household).toMatchObject({
      id: DEMO_HOUSEHOLD_ID,
      name: 'הבית שלנו',
      memberIds: [MICHAL, DANI],
      memberCount: 2,
      maxMembers: 6,
      createdBy: MICHAL,
      invite: null
    });
    const all = { requests: true, reminders: true, partnerDone: true, weekly: true };
    expect(rec.members[MICHAL]).toMatchObject({
      displayName: 'מיכל',
      color: 'terracotta',
      addressAs: 'f',
      role: 'owner',
      photoURL: null,
      notify: all,
      inviteCode: null
    });
    expect(rec.members[DANI]).toMatchObject({
      displayName: 'דני',
      color: 'slate',
      addressAs: 'm',
      role: 'member',
      photoURL: null,
      notify: all,
      inviteCode: DEMO_INVITE_CODE
    });
    expect(seed.invites[DEMO_INVITE_CODE]!.expiresAt).toBeLessThan(NOW.getTime()); // long expired
    expect(seed.invites[DEMO_INVITE_CODE]!.memberCount).toBe(1); // michal alone when it was made
  });
});

describe('createSeed: open tasks on 2026-10-04', () => {
  it('has 16 open and 14 done tasks', () => {
    expect(open).toHaveLength(16);
    expect(done).toHaveLength(14);
  });

  it('fills every Home bucket for מיכל: attention 3, requested 1, waiting 3, today 4, week 5, later 4', () => {
    const g = groupTasks(open, TODAY, memberIds, MICHAL);
    expect({
      attention: g.attention.length,
      requested: g.requested.length,
      waiting: g.waiting.length,
      today: g.today.length,
      week: g.week.length,
      later: g.later.length
    }).toEqual({ attention: 3, requested: 1, waiting: 3, today: 4, week: 5, later: 4 });
    // דני asked her: for him the parcel waits for someone to take it.
    const asDani = groupTasks(open, TODAY, memberIds, DANI);
    expect(asDani.requested).toEqual([]);
    expect(asDani.waiting.map((t) => t.id)).toContain('seed-post');
    const overdue = open.filter((t) => bucketInfo(t, TODAY).bucket === 'overdue');
    expect(overdue.map((t) => t.title)).toEqual(['להחזיר ספרים לספרייה']);
    const urgent = open.filter((t) => t.priority === 'urgent');
    expect(urgent).toHaveLength(2);
    expect(urgent.every((t) => needsAttention(t, TODAY))).toBe(true);
    expect(open.filter((t) => t.ownerId === null)).toHaveLength(4);
  });

  it('includes the scenarios the UI must show', () => {
    expect(task('seed-shirt')).toMatchObject({
      title: 'להחליף את החולצה בקניון',
      categoryId: 'returns',
      hardDeadline: true,
      dueDate: addDays(TODAY, 3)
    });

    const ac = task('seed-ac');
    expect(ac).toMatchObject({ title: 'לברר על מזגן חדש', categoryId: 'home', snoozeCount: 4 });
    expect(diffDays(TODAY, isoDateAt(ac.createdAt))).toBe(49); // 7 weeks
    expect(isStuck(ac, NOW)).toBe(true);

    const arnona = open.find((t) => t.title === 'לשלם ארנונה')!;
    expect(arnona).toMatchObject({
      categoryId: 'finance',
      dueDate: '2026-10-14',
      recurrence: { freq: 'monthly', anchor: '2026-08-14' },
      seriesId: 'seed-arnona',
      id: nextTaskId('seed-arnona', '2026-10-14')
    });

    expect(task('seed-car-test')).toMatchObject({ title: 'לתאם טסט לרכב', categoryId: 'car' });
    // A request still waiting for מיכל's answer: nobody holds it yet.
    expect(task('seed-post')).toMatchObject({
      ownerId: null,
      requestedOf: MICHAL,
      requestedBy: DANI,
      createdBy: DANI
    });
    expect(pendingRequestOf(task('seed-post'), memberIds)).toBe(MICHAL);
    // An accepted one, done since.
    expect(task('seed-pest-control')).toMatchObject({ ownerId: DANI, requestedBy: MICHAL });
    expect(pendingRequestOf(task('seed-pest-control'))).toBeNull();
    expect(task('seed-dentist')).toMatchObject({ dueDate: TODAY, dueTime: '16:30' });

    // The one week plan: the Saturday ending this week, no day, still in the week bucket.
    expect(task('seed-birthday-gift')).toMatchObject({
      ownerId: null,
      scheduledFor: '2026-10-10',
      weekPlan: true,
      dueDate: null
    });
    expect(bucketInfo(task('seed-birthday-gift'), TODAY).bucket).toBe('week');
    expect(tasks.filter((t) => t.weekPlan).map((t) => t.id)).toEqual(['seed-birthday-gift']);
    expect(task('seed-netflix').title).toBe('לבטל את המנוי ל-Netflix');
    expect(bucketInfo(task('seed-health-refund'), TODAY)).toEqual({
      bucket: 'today',
      plannedFromPast: true
    });

    const owners = new Set(open.map((t) => t.ownerId));
    expect(owners).toEqual(new Set([MICHAL, DANI, null]));
    expect(new Set(open.map((t) => t.priority))).toEqual(new Set(['normal', 'high', 'urgent']));
  });
});

describe('createSeed: done tasks and documentation', () => {
  it('spreads completions over ~5 months, split between both members', () => {
    expect(done.filter((t) => t.completedBy === MICHAL)).toHaveLength(7);
    expect(done.filter((t) => t.completedBy === DANI)).toHaveLength(7);
    const ages = done.map((t) => diffDays(TODAY, isoDateAt(t.completedAt!)));
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...ages)).toBeGreaterThanOrEqual(120);
    expect(Math.max(...ages)).toBeLessThanOrEqual(155);
    const documented = done.filter((t) => {
      const c = t.completion!;
      return c.note !== '' || c.cost !== null || c.place !== '' || c.contact !== '';
    });
    expect(documented).toHaveLength(14);
    expect(done.filter((t) => t.completion!.cost !== null).length).toBeGreaterThanOrEqual(8);
  });

  it('documents "החלפת מצבר" with garage, cost, contact and a receipt photo', () => {
    const battery = task('seed-battery');
    expect(battery).toMatchObject({ title: 'החלפת מצבר', categoryId: 'car' });
    expect(battery.completion).toMatchObject({
      place: 'מוסך השרון, כפר סבא',
      cost: 650,
      contact: 'יוסי · 050-1234567',
      photoIds: ['seed-photo-battery']
    });
    const photo = rec.photos['seed-photo-battery']!;
    expect(photo).toMatchObject({
      taskId: 'seed-battery',
      width: 120,
      height: 160,
      createdBy: DANI
    });
    expect(photo.dataUrl).toBe(SEED_RECEIPT_JPEG);
    expect(photo.thumbDataUrl).toBe(SEED_RECEIPT_THUMB);
  });

  it('embeds a small, valid JPEG photo (≤ 3 KB) and thumbnail', () => {
    const full = base64Bytes(SEED_RECEIPT_JPEG);
    const thumb = base64Bytes(SEED_RECEIPT_THUMB);
    expect(full.length).toBeLessThanOrEqual(3072);
    expect(imageSize(full)).toEqual({ width: 120, height: 160 });
    expect(imageSize(thumb)).toEqual({ width: 48, height: 64 });
    expect([full.at(-2), full.at(-1)]).toEqual([0xff, 0xd9]); // complete: ends with EOI
  });

  it('answers the Memory acceptance query', () => {
    const [hit] = searchDoneTasks(tasks, 'מתי החלפנו מצבר ובאיזה מוסך?');
    expect(hit?.id).toBe('seed-battery');
  });
});

describe('createSeed: jar and treats', () => {
  it('has "ארוחה במסעדה" at 7/10 in round 3 and two earned treats', () => {
    expect(rec.household.jar).toMatchObject({
      treat: 'ארוחה במסעדה',
      target: 10,
      count: 7,
      round: 3
    });
    expect(Object.values(rec.treats).map((t) => [t.id, t.treat])).toEqual([
      ['1', 'גלידה בנמל'],
      ['2', 'סרט בקולנוע']
    ]);
  });

  it('jar counts match the completions of each round', () => {
    const jar = rec.household.jar!;
    const completedIn = (from: number, to: number) =>
      done.filter((t) => t.completedAt! > from && t.completedAt! <= to).length;
    expect(completedIn(jar.startedAt, NOW.getTime())).toBe(jar.count);
    const [r1, r2] = [rec.treats['1']!, rec.treats['2']!];
    expect(completedIn(r1.redeemedAt!, r2.filledAt)).toBe(r2.target);
    for (const t of [r1, r2]) {
      expect(done.some((d) => d.completedAt === t.filledAt)).toBe(true);
      expect(t.filledAt).toBeLessThan(t.redeemedAt!);
    }
    expect(jar.startedAt).toBe(r2.redeemedAt);
  });
});

describe('createSeed: integrity', () => {
  it('uses valid enums everywhere', () => {
    const categories = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    for (const t of tasks) {
      expect(['normal', 'high', 'urgent']).toContain(t.priority);
      expect(t.categoryId === null || categories.has(t.categoryId)).toBe(true);
      expect(['open', 'done']).toContain(t.status);
      if (t.recurrence) expect(['weekly', 'monthly', 'yearly']).toContain(t.recurrence.freq);
      if (t.dueTime) expect(t.dueTime).toMatch(/^\d{2}:\d{2}$/);
      expect(typeof t.weekPlan).toBe('boolean');
      if (t.weekPlan) expect(t.scheduledFor).not.toBeNull();
    }
    const types = [
      'created',
      'taken',
      'requested',
      'released',
      'completed',
      'reopened',
      'snoozed',
      'edited',
      'deleted',
      'jar_filled',
      'jar_redeemed',
      'member_joined',
      'accepted',
      'declined'
    ];
    for (const e of rec.events) {
      expect(types).toContain(e.type);
      expect(e.push).toBe(
        ['requested', 'accepted', 'declined', 'completed', 'jar_filled'].includes(e.type)
          ? 'sent'
          : 'none'
      );
    }
  });

  it('references only members and existing tasks', () => {
    const isMember = (uid: string | null) => uid === null || memberIds.includes(uid);
    for (const t of tasks) {
      for (const uid of [
        t.ownerId,
        t.requestedBy,
        t.requestedOf ?? null,
        t.createdBy,
        t.updatedBy,
        t.completedBy
      ]) {
        expect(isMember(uid)).toBe(true);
      }
      expect(t.updatedAt).toBeGreaterThanOrEqual(t.createdAt);
      expect(t.completion === null).toBe(t.status === 'open');
    }
    for (const e of rec.events) {
      expect(isMember(e.actorId)).toBe(true);
      expect(isMember(e.targetId)).toBe(true);
      if (e.taskId !== null) expect(rec.tasks[e.taskId]?.title).toBe(e.taskTitle);
    }
  });

  it('never stores the client-only `pending` flag', () => {
    expect(tasks.every((t) => !('pending' in t))).toBe(true);
  });

  it('has events that explain every task, oldest first with unique ids', () => {
    const evs = rec.events;
    expect(new Set(evs.map((e) => e.id)).size).toBe(evs.length);
    for (let i = 1; i < evs.length; i++)
      expect(evs[i]!.createdAt).toBeGreaterThanOrEqual(evs[i - 1]!.createdAt);
    const of = (id: string, type: string) => evs.filter((e) => e.taskId === id && e.type === type);
    for (const t of tasks) {
      if (t.seriesId === null) expect(of(t.id, 'created')).toHaveLength(1);
      if (t.requestedBy) {
        expect(of(t.id, 'requested')[0]).toMatchObject({
          actorId: t.requestedBy,
          targetId: t.requestedOf ?? t.ownerId
        });
        // Owned after a request: the owner accepted it.
        if (t.ownerId)
          expect(of(t.id, 'accepted')[0]).toMatchObject({
            actorId: t.ownerId,
            targetId: t.requestedBy
          });
        else expect(of(t.id, 'accepted')).toEqual([]);
      }
      if (t.ownerId && t.ownerId !== t.createdBy && !t.requestedBy) {
        expect(of(t.id, 'taken')[0]?.actorId).toBe(t.ownerId);
      }
      if (t.status === 'done') {
        expect(of(t.id, 'completed')[0]).toMatchObject({
          actorId: t.completedBy,
          createdAt: t.completedAt
        });
      }
      expect(of(t.id, 'snoozed')).toHaveLength(t.snoozeCount);
    }
    expect(evs.filter((e) => e.type === 'jar_filled')).toHaveLength(2);
    expect(evs.filter((e) => e.type === 'jar_redeemed')).toHaveLength(2);
    expect(evs.filter((e) => e.type === 'member_joined')).toEqual([
      expect.objectContaining({ actorId: DANI })
    ]);
  });

  it('chains the ארנונה series exactly as buildNextInstance would', () => {
    const series = tasks.filter((t) => t.id === 'seed-arnona' || t.seriesId === 'seed-arnona');
    series.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    expect(series.map((t) => t.status)).toEqual(['done', 'done', 'open']);
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1]!;
      const next = buildNextInstance(
        prev,
        isoDateAt(prev.completedAt!),
        prev.completedAt!,
        prev.completedBy!
      )!;
      const actual = series[i]!;
      if (actual.status === 'open') expect(actual).toEqual(next);
      else
        expect({
          ...actual,
          status: 'open',
          completedAt: null,
          completedBy: null,
          completion: null,
          updatedAt: actual.createdAt
        }).toEqual(next);
    }
  });

  it('is deterministic: same day, same seed (fixed ids, no randomness)', () => {
    expect(createSeed(new Date(NOW))).toEqual(seed);
    expect(createSeed(new Date('2026-10-04T23:30:00+03:00'))).toEqual(seed);
    expect(tasks.every((t) => t.id.startsWith('seed-'))).toBe(true);
    expect(createSeed(new Date('2026-10-05T09:00:00+03:00'))).not.toEqual(seed);
  });

  it.each([
    '2026-10-04T00:05:00+03:00',
    '2026-03-27T08:00:00+03:00', // DST starts in Israel
    '2026-10-25T23:55:00+02:00', // DST ends
    '2028-02-29T12:00:00+02:00', // leap day
    '2027-01-31T21:00:00+02:00', // month end (clamped anchor)
    '2030-07-01T06:00:00+03:00'
  ])('stays coherent relative to %s', (iso) => {
    const now = new Date(iso);
    const today = todayISO(now);
    const p = parts(createSeed(now));
    expect(p.open).toHaveLength(16);
    expect(p.done).toHaveLength(14);
    for (const t of p.tasks) {
      expect(t.createdAt).toBeLessThanOrEqual(now.getTime());
      expect(t.updatedAt).toBeLessThanOrEqual(now.getTime());
      if (t.completedAt !== null) expect(t.completedAt).toBeLessThanOrEqual(now.getTime());
    }
    expect(bucketInfo(p.task('seed-library'), today).bucket).toBe('overdue');
    const arnona = p.open.find((t) => t.seriesId === 'seed-arnona')!;
    expect(diffDays(arnona.dueDate!, today)).toBeGreaterThanOrEqual(8);
    expect(diffDays(arnona.dueDate!, today)).toBeLessThanOrEqual(10);
    const jar = p.rec.household.jar!;
    expect(p.done.filter((t) => t.completedAt! > jar.startedAt)).toHaveLength(jar.count);
  });
});

describe('jerusalemInstant', () => {
  it('converts Israel wall-clock time in summer (+03:00) and winter (+02:00)', () => {
    expect(jerusalemInstant('2026-10-04', '09:00')).toBe(Date.parse('2026-10-04T09:00:00+03:00'));
    expect(jerusalemInstant('2026-12-01', '21:30')).toBe(Date.parse('2026-12-01T21:30:00+02:00'));
    expect(jerusalemInstant('2026-10-25', '00:30')).toBe(Date.parse('2026-10-25T00:30:00+03:00'));
  });
});
