// owner: step 2.2 — the largest write the adapter makes, the complete-batch at full size (3 photos,
// a recurring task whose next instance is created, the jar +1 that fills it, and the jar_filled
// event), succeeds under the real rules, whose dependent reads the emulator limits (10 per
// document, 20 per request). Both paths: the online transaction and the offline writeBatch.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { disableNetwork, doc, enableNetwork, getDoc, type Firestore } from 'firebase/firestore';
import { RepoError } from '$lib/data/repository';
import { addMonths, todayISO } from '$lib/domain/dates';
import { nextTaskId } from '$lib/domain/recurrence';
import type { EncodedPhoto, Household, Task } from '$lib/domain/types';
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

/** A JPEG data URL near the stored maximums (the content is opaque to the rules). */
function bigJpeg(chars: number): string {
  const prefix = 'data:image/jpeg;base64,';
  return prefix + 'A'.repeat(chars - prefix.length);
}
const maxPhoto = (): EncodedPhoto => ({
  dataUrl: bigJpeg(299_000),
  thumbDataUrl: bigJpeg(19_900),
  width: 1600,
  height: 1200
});

let repo: FirebaseRepo | undefined;

beforeAll(async () => {
  await clearEmulators();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await repo?.dispose();
  repo = undefined;
});

/** A household with a jar one marble from full and a recurring task owned by me. */
async function setup(label: string) {
  const r = (repo = await createTestRepository());
  const uid = `${label}-${Date.now().toString(36)}`;
  await r.signInWithTestCredential(uid, 'מיכל');
  const hid = await r.createHousehold('הבית', {
    displayName: 'מיכל',
    photoURL: null,
    color: 'terracotta',
    addressAs: 'f'
  });
  r.setJar(hid, { treat: 'ארוחה במסעדה', target: 3 });
  for (const title of ['א', 'ב']) {
    const id = r.createTask(hid, { title });
    await r.completeTask(hid, id, { note: '', cost: null, place: '', contact: '' }, []);
  }
  const due = todayISO(Date.now());
  const id = r.createTask(hid, {
    title: 'לשלם ארנונה',
    categoryId: 'finance',
    priority: 'urgent',
    ownerId: uid,
    dueDate: due,
    dueTime: '09:00',
    recurrence: { freq: 'monthly' }
  });
  const household = record<Household>((cb) => r.watchHousehold(hid, cb));
  const task = record<Task | null>((cb) => r.watchTask(hid, id, cb));
  await eventually(
    () => household.last()?.jar?.count === 2 && task.last()?.pending === false,
    'jar at 2/3 and the task on the server'
  );
  const errors: RepoError[] = [];
  r.onWriteError((e) => errors.push(e));
  return { r, uid, hid, id, due, errors, stop: () => (household.stop(), task.stop()) };
}

const DOCS = {
  note: 'נ'.repeat(2000),
  cost: 10_000_000,
  place: 'מ'.repeat(120),
  contact: 'ק'.repeat(120)
};

async function expectFullCompletionOnServer(hid: string, id: string, uid: string, nextId: string) {
  const task = await serverDoc(`households/${hid}/tasks/${id}`);
  expect(restValue(task?.status)).toBe('done');
  const completion = restValue(task?.completion) as { photoIds: string[]; cost: number };
  expect(completion.photoIds).toHaveLength(3);
  expect(completion.cost).toBe(10_000_000);
  for (const pid of completion.photoIds) {
    const p = await serverDoc(`households/${hid}/photos/${pid}`);
    expect(restValue(p?.taskId)).toBe(id);
    expect((restValue(p?.dataUrl) as string).length).toBe(299_000);
  }
  const next = await serverDoc(`households/${hid}/tasks/${nextId}`);
  expect(restValue(next?.seriesId)).toBe(id);
  expect(restValue(next?.priority)).toBe('normal');
  expect(restValue(next?.ownerId)).toBe(uid);
  const jar = restValue((await serverDoc(`households/${hid}`))?.jar) as { count: number };
  expect(jar.count).toBe(3);
  const types = [...(await serverList(`households/${hid}/events`)).values()].map((f) =>
    restValue(f.type)
  );
  expect(types.filter((t) => t === 'jar_filled')).toHaveLength(1);
  expect(types.filter((t) => t === 'completed')).toHaveLength(3);
}

describe('complete-batch at full size, under the rules', () => {
  it('online: one transaction with 3 photos, next instance, jar +1 and jar_filled', async () => {
    const { r, uid, hid, id, due, errors, stop } = await setup('maxtx');
    const result = await r.completeTask(hid, id, DOCS, [maxPhoto(), maxPhoto(), maxPhoto()]);
    const nextId = nextTaskId(id, addMonths(due, 1));
    expect(result).toEqual({ nextTaskId: nextId, jarFilled: true });
    await expectFullCompletionOnServer(hid, id, uid, nextId);
    expect(errors).toEqual([]);
    stop();
  });

  it('offline: the same writes in one writeBatch, accepted when the network returns', async () => {
    const { r, uid, hid, id, due, errors, stop } = await setup('maxbatch');
    const db = r.firestore as Firestore;
    const nextId = nextTaskId(id, addMonths(due, 1));
    // Known absent in the cache, so the next instance rides in the same batch (all 8 writes).
    expect((await getDoc(doc(db, 'households', hid, 'tasks', nextId))).exists()).toBe(false);
    vi.stubGlobal('navigator', { onLine: false, userAgent: globalThis.navigator?.userAgent ?? 'node' });
    await disableNetwork(db);
    const result = await r.completeTask(hid, id, DOCS, [maxPhoto(), maxPhoto(), maxPhoto()]);
    expect(result).toEqual({ nextTaskId: nextId, jarFilled: true });
    expect(await serverDoc(`households/${hid}/tasks/${nextId}`)).toBeNull();
    vi.unstubAllGlobals();
    await enableNetwork(db);
    await eventually(
      async () => restValue((await serverDoc(`households/${hid}/tasks/${id}`))?.status) === 'done',
      'the batch on the server'
    );
    await expectFullCompletionOnServer(hid, id, uid, nextId);
    expect(errors).toEqual([]);
    stop();
  });
});
