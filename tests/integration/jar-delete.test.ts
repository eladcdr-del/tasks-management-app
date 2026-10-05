// Deleting the jar against the emulators (Firebase adapter, rules enforced): what is stored, and
// the one race the delete brings: a completion queued offline while the jar still existed, synced
// after another phone deleted it. The rules refuse that completion as a whole (its jar step would
// build a jar without treat or target); it is reported, nothing half-written reaches the server,
// and the local view never shows a "jar" without a treat on the way.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { disableNetwork, enableNetwork, type Firestore } from 'firebase/firestore';
import type { RepoError } from '$lib/data/repository';
import type { Household, Task } from '$lib/domain/types';
import {
  EMULATOR,
  PROJECT_ID,
  clearEmulators,
  createTestRepository,
  eventually,
  record,
  restValue,
  serverDoc,
  type FirebaseRepo
} from './emulator';

const MOM = { displayName: 'מיכל', photoURL: null, color: 'sage', addressAs: 'f' } as const;
const NO_DOCS = { note: '', cost: null, place: '', contact: '' };

let repo: FirebaseRepo | undefined;

beforeAll(async () => {
  await clearEmulators();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await repo?.dispose();
  repo = undefined;
});

/** Writes fields as an admin (rules bypassed): here, another phone's delete. */
async function adminPatch(path: string, fields: Record<string, unknown>): Promise<void> {
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const url = `http://${EMULATOR.host}:${EMULATOR.firestorePort}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?${mask}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`adminPatch ${path}: ${res.status} ${await res.text()}`);
}

describe('deleting the jar (Firebase adapter)', () => {
  it('stores {jar: null, nextJarRound}; the next jar starts at that round', async () => {
    const r = (repo = await createTestRepository());
    await r.signInWithTestCredential(`del-${Date.now().toString(36)}`, 'מיכל');
    const hid = await r.createHousehold('הבית', MOM);
    const household = record<Household>((cb) => r.watchHousehold(hid, cb));
    r.setJar(hid, { treat: 'גלידה', mode: 'each', share: 2 });
    await eventually(() => household.last()?.jar?.round === 1, 'the jar');

    r.deleteJar(hid);
    await eventually(() => household.last()?.jar === null, 'no jar');
    await eventually(async () => {
      const h = await serverDoc(`households/${hid}`);
      return restValue(h?.jar) === null && restValue(h?.nextJarRound) === 2;
    }, 'the delete on the server');

    r.setJar(hid, { treat: 'סרט', target: 4 });
    await eventually(() => household.last()?.jar?.treat === 'סרט', 'the new jar');
    expect(household.last()!.jar).toMatchObject({ round: 2, count: 0, counts: {} });
    household.stop();
  });

  it('a completion queued offline before another phone deleted the jar is refused as a whole and reported', async () => {
    const r = (repo = await createTestRepository());
    await r.signInWithTestCredential(`race-${Date.now().toString(36)}`, 'מיכל');
    const hid = await r.createHousehold('הבית', MOM);
    const errors: RepoError[] = [];
    const stopErrors = r.onWriteError((e) => errors.push(e));
    const household = record<Household>((cb) => r.watchHousehold(hid, cb));
    const open = record<Task[]>((cb) => r.watchOpenTasks(hid, cb));
    r.setJar(hid, { treat: 'גלידה', target: 5 });
    const id = r.createTask(hid, { title: 'לקנות חלב' });
    await eventually(
      () => household.last()?.jar !== null && open.last()?.some((t) => t.id === id && !t.pending),
      'the jar and an acknowledged task'
    );
    await eventually(async () => (await serverDoc(`households/${hid}`))?.jar, 'jar on the server');

    // Offline: the completion carries the jar step (the jar is still there, as far as I know).
    vi.stubGlobal('navigator', { onLine: false, userAgent: 'node' });
    await disableNetwork(r.firestore as Firestore);
    expect(await r.completeTask(hid, id, NO_DOCS, [])).toEqual({
      nextTaskId: null,
      jarFilled: false
    });

    // Meanwhile another phone deletes the jar (round 1).
    await adminPatch(`households/${hid}`, {
      jar: { nullValue: null },
      nextJarRound: { integerValue: '2' }
    });

    // Back online: refused, reported; the task is open again and the household holds no jar.
    vi.unstubAllGlobals();
    await enableNetwork(r.firestore as Firestore);
    await eventually(() => errors.some((e) => e.code === 'permission'), 'a permission error');
    await eventually(() => open.last()?.some((t) => t.id === id && !t.pending), 'open again');
    const task = await serverDoc(`households/${hid}/tasks/${id}`);
    expect(restValue(task?.status)).toBe('open');
    const h = await serverDoc(`households/${hid}`);
    expect(restValue(h?.jar)).toBeNull();
    await eventually(() => household.last()?.jar === null, 'no jar locally');
    // Never a "jar" without a treat on the way (the queued increments on a null jar).
    for (const v of household.values) {
      expect(v.jar === null || v.jar.treat === 'גלידה').toBe(true);
    }

    // Completing it again (now without a jar) lands.
    await r.completeTask(hid, id, NO_DOCS, []);
    await eventually(
      async () => restValue((await serverDoc(`households/${hid}/tasks/${id}`))?.status) === 'done',
      'done on the server'
    );
    stopErrors();
    household.stop();
    open.stop();
  });
});
