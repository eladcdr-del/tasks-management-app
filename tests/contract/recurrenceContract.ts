// The Repository contract for flexible recurring tasks (daily, every N periods, listed weekdays):
// one adapter-agnostic suite, run by the demo adapter (tests/contract/demo.recurrence.contract.test.ts)
// and by the Firebase adapter on the emulators with the rules enforced
// (tests/integration/recurrence.firebase.test.ts). Like repositoryContract.ts it only touches the
// public Repository interface; expected dates come from the domain module (recurrence.ts) or from
// date arithmetic relative to "today", so the suite holds on any day.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepoError, type Repository } from '$lib/data/repository';
import { addDays, startOfWeek, todayISO, weekday } from '$lib/domain/dates';
import { nextTaskId } from '$lib/domain/recurrence';
import type { ISODate, Recurrence, Task, TaskDraft, Unsubscribe } from '$lib/domain/types';
import type { ContractEnv, ContractFactory, ContractOptions } from './repositoryContract';

const NO_DOCS = { note: '', cost: null, place: '', contact: '' };
const PROFILE = {
  displayName: 'מיכל',
  photoURL: null,
  color: 'terracotta',
  addressAs: 'f'
} as const;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function runRecurrenceContract(
  name: string,
  factory: ContractFactory,
  options: ContractOptions = {}
): void {
  const T = options.timeoutMs ?? 3000;

  describe(`Recurrence contract: ${name}`, () => {
    let env!: ContractEnv;
    let repo!: Repository;
    const runId = Math.random().toString(36).slice(2, 8);
    let seq = 0;

    beforeEach(async () => {
      env = await factory();
      repo = env.repo;
    });
    afterEach(async () => {
      await env.cleanup();
    });

    const now = () => env.clock?.now() ?? Date.now();
    const today = (): ISODate => todayISO(now());

    /** The first emission of task `id` that satisfies `pred`. */
    function taskOf(
      hid: string,
      id: string,
      pred: (t: Task | null) => boolean
    ): Promise<Task | null> {
      return new Promise((resolve, reject) => {
        let done = false;
        let unsub: Unsubscribe | undefined;
        let last: Task | null | undefined;
        const timer = setTimeout(() => {
          done = true;
          unsub?.();
          reject(
            new Error(`Timed out after ${T}ms waiting for task ${id}: ${JSON.stringify(last)}`)
          );
        }, T);
        unsub = repo.watchTask(hid, id, (t) => {
          last = t;
          if (done || !pred(t)) return;
          done = true;
          clearTimeout(timer);
          unsub?.();
          resolve(t);
        });
        if (done) unsub();
      });
    }
    const existing = async (hid: string, id: string, pred: (t: Task) => boolean = () => true) =>
      (await taskOf(hid, id, (t) => t !== null && pred(t))) as Task;

    async function solo() {
      const uid = `rec-${runId}-${++seq}`;
      await env.asUser(uid);
      const hid = await repo.createHousehold('הבית', PROFILE);
      return { hid, uid };
    }

    async function newTask(hid: string, draft: TaskDraft) {
      const id = repo.createTask(hid, draft);
      await existing(hid, id);
      return id;
    }

    /** Runs a queued write and resolves with the error the adapter reports for it. */
    async function rejected(write: () => void): Promise<RepoError> {
      const errors: RepoError[] = [];
      const stop = repo.onWriteError((e) => errors.push(e));
      write();
      const deadline = Date.now() + T;
      while (errors.length === 0) {
        if (Date.now() > deadline) throw new Error('expected the write to be rejected');
        await sleep(5);
      }
      stop();
      return errors[0] as RepoError;
    }

    describe('createTask', () => {
      it('stores a daily rule anchored at its date', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, {
          title: 'להשקות עציצים',
          scheduledFor: today(),
          recurrence: { freq: 'daily' }
        });
        expect((await existing(hid, id)).recurrence).toEqual({ freq: 'daily', anchor: today() });
      });

      it('stores interval and weekdays canonically (sorted, unique, interval 1 dropped)', async () => {
        const { hid } = await solo();
        const a = await newTask(hid, {
          title: 'חוג',
          scheduledFor: today(),
          recurrence: { freq: 'weekly', interval: 2, weekdays: [3, 0, 3] }
        });
        const b = await newTask(hid, {
          title: 'לנקות',
          scheduledFor: today(),
          recurrence: { freq: 'monthly', interval: 1 }
        });
        const c = await newTask(hid, {
          title: 'פילטר',
          recurrence: { freq: 'monthly', interval: 3, weekdays: [1] }
        });
        expect((await existing(hid, a)).recurrence).toEqual({
          freq: 'weekly',
          interval: 2,
          weekdays: [0, 3],
          anchor: today()
        });
        expect((await existing(hid, b)).recurrence).toEqual({ freq: 'monthly', anchor: today() });
        expect((await existing(hid, c)).recurrence).toEqual({ freq: 'monthly', interval: 3 });
      });

      it('rejects an interval outside 1-99 and weekdays outside 0-6', async () => {
        const { hid } = await solo();
        const bad: Recurrence[] = [
          { freq: 'daily', interval: 0 },
          { freq: 'weekly', interval: 100 },
          { freq: 'daily', interval: 1.5 },
          { freq: 'weekly', weekdays: [7] }
        ];
        for (const recurrence of bad) {
          let id = '';
          const err = await rejected(() => {
            id = repo.createTask(hid, { title: 'לא תקין', recurrence });
          });
          expect(err.code, JSON.stringify(recurrence)).toBe('permission');
          await taskOf(hid, id, (t) => t === null);
        }
      });
    });

    describe('completeTask', () => {
      it('daily: the next instance is the next day, carrying the rule and the anchor', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, {
          title: 'לתת לכלב אוכל',
          scheduledFor: today(),
          recurrence: { freq: 'daily' }
        });
        const r = await repo.completeTask(hid, id, NO_DOCS, []);
        const tomorrow = addDays(today(), 1);
        expect(r.nextTaskId).toBe(nextTaskId(id, tomorrow));
        expect(await existing(hid, r.nextTaskId!)).toMatchObject({
          status: 'open',
          scheduledFor: tomorrow,
          dueDate: null,
          seriesId: id,
          recurrence: { freq: 'daily', anchor: today() }
        });
      });

      it('every 3 days, completed late: one next instance on the series, after today', async () => {
        const { hid } = await solo();
        const start = addDays(today(), -7); // the series: start, +3, +6, +9 …
        const id = await newTask(hid, {
          title: 'להשקות',
          dueDate: start,
          recurrence: { freq: 'daily', interval: 3 }
        });
        const r = await repo.completeTask(hid, id, NO_DOCS, []);
        const next = addDays(start, 9); // today + 2: start + 6 (yesterday) is skipped
        expect(r.nextTaskId).toBe(nextTaskId(id, next));
        expect(await existing(hid, r.nextTaskId!)).toMatchObject({
          dueDate: next,
          recurrence: { freq: 'daily', interval: 3, anchor: start }
        });
      });

      it('listed weekdays every 2 weeks: Sunday → Wednesday → two weeks on', async () => {
        const { hid } = await solo();
        const sunday = startOfWeek(addDays(today(), 28)); // a Sunday ahead: the completions are early
        const rule = { freq: 'weekly' as const, interval: 2, weekdays: [0, 3] };
        const id = await newTask(hid, { title: 'חוג', scheduledFor: sunday, recurrence: rule });
        const r1 = await repo.completeTask(hid, id, NO_DOCS, []);
        const wed = addDays(sunday, 3);
        expect(r1.nextTaskId).toBe(nextTaskId(id, wed));
        const n1 = await existing(hid, r1.nextTaskId!);
        expect(n1).toMatchObject({
          scheduledFor: wed,
          weekPlan: false,
          recurrence: { ...rule, anchor: sunday }
        });
        const r2 = await repo.completeTask(hid, n1.id, NO_DOCS, []);
        expect(r2.nextTaskId).toBe(nextTaskId(id, addDays(sunday, 14)));
        expect((await existing(hid, r2.nextTaskId!)).recurrence).toEqual({
          ...rule,
          anchor: sunday
        });
      });

      it('a weekly week plan stays a week plan every N weeks', async () => {
        const { hid } = await solo();
        const saturday = addDays(startOfWeek(addDays(today(), 14)), 6);
        const id = await newTask(hid, {
          title: 'לנקות את המקרר',
          scheduledFor: saturday,
          weekPlan: true,
          recurrence: { freq: 'weekly', interval: 2 }
        });
        const r = await repo.completeTask(hid, id, NO_DOCS, []);
        expect(await existing(hid, r.nextTaskId!)).toMatchObject({
          scheduledFor: addDays(saturday, 14),
          weekPlan: true
        });
      });
    });

    describe('updateTask', () => {
      it('changing the days or the interval re-anchors at the date; other edits keep the anchor', async () => {
        const { hid } = await solo();
        const first = addDays(today(), 2);
        const id = await newTask(hid, {
          title: 'חוג',
          scheduledFor: first,
          recurrence: { freq: 'weekly' }
        });
        await existing(hid, id, (t) => t.recurrence?.anchor === first);

        repo.updateTask(hid, id, { notes: 'להביא בגדי ספורט' });
        expect((await existing(hid, id, (t) => t.notes !== '')).recurrence).toEqual({
          freq: 'weekly',
          anchor: first
        });

        const days = [weekday(first), (weekday(first) + 3) % 7].sort((a, b) => a - b);
        repo.updateTask(hid, id, { recurrence: { freq: 'weekly', weekdays: days } });
        expect(
          (await existing(hid, id, (t) => t.recurrence?.weekdays !== undefined)).recurrence
        ).toEqual({ freq: 'weekly', weekdays: days, anchor: first });

        repo.updateTask(hid, id, { recurrence: { freq: 'weekly', interval: 2, weekdays: days } });
        expect((await existing(hid, id, (t) => t.recurrence?.interval === 2)).recurrence).toEqual({
          freq: 'weekly',
          interval: 2,
          weekdays: days,
          anchor: first
        });

        // back to a plain rule: the optional keys are gone, not left behind
        repo.updateTask(hid, id, { recurrence: { freq: 'daily' } });
        expect((await existing(hid, id, (t) => t.recurrence?.freq === 'daily')).recurrence).toEqual(
          { freq: 'daily', anchor: first }
        );
      });

      it('a snooze keeps the rule and the anchor', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, {
          title: 'להשקות',
          scheduledFor: today(),
          recurrence: { freq: 'daily', interval: 2 }
        });
        repo.snoozeTask(hid, id, addDays(today(), 3));
        const t = await existing(hid, id, (x) => x.snoozeCount === 1);
        expect(t.recurrence).toEqual({ freq: 'daily', interval: 2, anchor: today() });
      });
    });

    describe('reopenTask', () => {
      it('deletes the untouched next instance of a weekday series', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, {
          title: 'חוג',
          scheduledFor: today(),
          recurrence: { freq: 'weekly', interval: 3, weekdays: [0, 2, 4] }
        });
        const { nextTaskId: next } = await repo.completeTask(hid, id, NO_DOCS, []);
        await existing(hid, next!);
        repo.reopenTask(hid, id);
        await existing(hid, id, (t) => t.status === 'open');
        await taskOf(hid, next!, (t) => t === null);
      });
    });
  });
}
