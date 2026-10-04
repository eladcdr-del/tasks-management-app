// owner: step 2.2 — offline queueing: with the network cut, task writes (create, take, complete,
// a recurring completion) are accepted at once, watchers show them optimistically with
// `pending: true`, watchSync reports offline; when the network returns everything reaches the
// server (rules enforced), `pending` clears and watchSync reports synced, with no write errors.
//
// "Offline" = Firestore's network disabled (disableNetwork) + navigator.onLine === false, which is
// what the adapter consults to choose the batch path over a transaction.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { disableNetwork, enableNetwork, type Firestore } from 'firebase/firestore';
import { RepoError } from '$lib/data/repository';
import { addDays, todayISO } from '$lib/domain/dates';
import type { EncodedPhoto, Household, SyncState, Task } from '$lib/domain/types';
import {
  clearEmulators,
  createTestRepository,
  eventually,
  record,
  restValue,
  serverDoc,
  serverList,
  type FirebaseRepo
} from './emulator';

const JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKABpl//2Q==';
const photo = (): EncodedPhoto => ({ dataUrl: JPEG, thumbDataUrl: JPEG, width: 1, height: 1 });
const DOCS = { note: 'קבלה בתמונה', cost: 120, place: 'חנות', contact: '' };

let repo: FirebaseRepo | undefined;

beforeAll(async () => {
  await clearEmulators();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await repo?.dispose();
  repo = undefined;
});

function goOffline(r: FirebaseRepo) {
  vi.stubGlobal('navigator', {
    onLine: false,
    userAgent: globalThis.navigator?.userAgent ?? 'node'
  });
  return disableNetwork(r.firestore as Firestore);
}

function goOnline(r: FirebaseRepo) {
  vi.unstubAllGlobals();
  return enableNetwork(r.firestore as Firestore);
}

describe('offline queueing (Firebase adapter)', () => {
  it('accepts task writes offline, shows them as pending, and syncs them when back online', async () => {
    const r = (repo = await createTestRepository());
    const uid = `offline-${Date.now().toString(36)}`;
    await r.signInWithTestCredential(uid, 'מיכל');
    const hid = await r.createHousehold('הבית', {
      displayName: 'מיכל',
      photoURL: null,
      color: 'terracotta',
      addressAs: 'f'
    });
    const errors: RepoError[] = [];
    const stopErrors = r.onWriteError((e) => errors.push(e));

    // Live watchers keep everything in the local cache, as the app's screens do.
    const household = record<Household>((cb) => r.watchHousehold(hid, cb));
    const open = record<Task[]>((cb) => r.watchOpenTasks(hid, cb));
    const done = record<Task[]>((cb) => r.watchDoneTasks(hid, 20, (t) => cb(t)));
    const sync = record<SyncState>((cb) => r.watchSync(cb));
    r.setJar(hid, { treat: 'גלידה', target: 5 });
    const existingId = r.createTask(hid, { title: 'משימה מלפני הניתוק' });
    await eventually(
      () =>
        household.last()?.jar !== null &&
        open.last()?.some((t) => t.id === existingId && !t.pending),
      'jar and an acknowledged task'
    );
    await eventually(() => sync.last()?.status === 'synced', 'synced before going offline');

    // ── offline ──
    await goOffline(r);
    const due = todayISO(Date.now());
    const created = r.createTask(hid, { title: 'נוצרה בלי רשת' });
    const recurring = r.createTask(hid, {
      title: 'להשקות עציצים',
      dueDate: due,
      recurrence: { freq: 'weekly' }
    });
    const pendingCreated = await eventually(
      () => open.last()?.find((t) => t.id === created && t.pending),
      'the offline task, pending'
    );
    expect(pendingCreated).toMatchObject({
      title: 'נוצרה בלי רשת',
      status: 'open',
      createdBy: uid
    });
    expect(typeof pendingCreated.createdAt).toBe('number');

    // takeTask resolves without the network (batch path, decided from the cache).
    expect(await r.takeTask(hid, existingId)).toEqual({ ok: true });
    await eventually(
      () => open.last()?.find((t) => t.id === existingId && t.ownerId === uid && t.pending),
      'the taken task, pending'
    );

    // completeTask too, photos and jar included.
    expect(await r.completeTask(hid, created, DOCS, [photo()])).toEqual({
      nextTaskId: null,
      jarFilled: false
    });
    const doneTask = await eventually(
      () => done.last()?.find((t) => t.id === created && t.pending),
      'the offline completion, pending'
    );
    expect(doneTask.completion).toMatchObject({ ...DOCS, photoIds: [expect.any(String)] });
    const recurringResult = await r.completeTask(hid, recurring, { ...DOCS, cost: null }, []);
    const nextId = recurringResult.nextTaskId!;
    expect(nextId).toBe(`${recurring}__${addDays(due, 7)}`);
    await eventually(
      () => open.last()?.find((t) => t.id === nextId && t.pending),
      'the next instance, pending'
    );
    await eventually(() => household.last()?.jar?.count === 2, 'the jar counts both offline');

    const offlineSync = await eventually(
      () => (sync.last()?.status === 'offline' ? sync.last() : undefined),
      'watchSync offline'
    );
    expect(offlineSync.pendingWrites).toBeGreaterThan(0);
    expect(await serverDoc(`households/${hid}/tasks/${created}`)).toBeNull();

    // ── back online ──
    await goOnline(r);
    await eventually(() => {
      const s = sync.last();
      return s?.status === 'synced' && s.pendingWrites === 0;
    }, 'watchSync synced');
    await eventually(
      () =>
        done.last()?.some((t) => t.id === created && !t.pending) &&
        open.last()?.some((t) => t.id === nextId && !t.pending) &&
        open.last()?.some((t) => t.id === existingId && !t.pending),
      'pending cleared'
    );

    const serverTask = await serverDoc(`households/${hid}/tasks/${created}`);
    expect(restValue(serverTask?.status)).toBe('done');
    expect(restValue(serverTask?.completedBy)).toBe(uid);
    const photoId = (restValue(serverTask?.completion) as { photoIds: string[] }).photoIds[0]!;
    expect(await serverDoc(`households/${hid}/photos/${photoId}`)).not.toBeNull();
    expect(restValue((await serverDoc(`households/${hid}/tasks/${existingId}`))?.ownerId)).toBe(
      uid
    );
    expect(restValue((await serverDoc(`households/${hid}/tasks/${nextId}`))?.seriesId)).toBe(
      recurring
    );
    const jar = restValue((await serverDoc(`households/${hid}`))?.jar) as { count: number };
    expect(jar.count).toBe(2);
    const events = [...(await serverList(`households/${hid}/events`)).values()].map((f) =>
      restValue(f.type)
    );
    expect(events.filter((t) => t === 'completed')).toHaveLength(2);
    expect(events).toContain('taken');

    expect(errors).toEqual([]);
    for (const rec of [household, open, done, sync]) rec.stop();
    stopErrors();
  });

  it('takeTask offline keeps someone else’s task theirs (decided from the cache)', async () => {
    const r = (repo = await createTestRepository());
    const a = `offA-${Date.now().toString(36)}`;
    const b = `offB-${Date.now().toString(36)}`;
    await r.signInWithTestCredential(a, 'מיכל');
    const profile = { photoURL: null, color: 'sage', addressAs: 'f' } as const;
    const hid = await r.createHousehold('הבית', { ...profile, displayName: 'מיכל' });
    const invite = await r.createInvite(hid);
    await r.signInWithTestCredential(b, 'דני');
    await r.joinHousehold(invite.code, { ...profile, displayName: 'דני', color: 'slate' });
    const id = r.createTask(hid, { title: 'של דני', ownerId: b });
    await r.signInWithTestCredential(a, 'מיכל');

    const household = record<Household>((cb) => r.watchHousehold(hid, cb));
    const task = record<Task | null>((cb) => r.watchTask(hid, id, cb));
    await eventually(
      () => household.last()?.memberCount === 2 && task.last()?.ownerId === b,
      'cached household and task'
    );
    await goOffline(r);
    expect(await r.takeTask(hid, id)).toEqual({ ok: false, takenBy: b });
    household.stop();
    task.stop();
  });
});
