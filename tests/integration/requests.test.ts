// Requests against the emulators (Firebase adapter, rules enforced): documents written by the
// previous app version (no requestedOf; a request was ownerId = the asked member) keep loading and
// updating, a new request stores requestedOf (and only a request does), and the asked member's
// answers queued offline reach the server once the network returns.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { disableNetwork, enableNetwork, type Firestore } from 'firebase/firestore';
import type { NewMemberProfile, RepoError } from '$lib/data/repository';
import { requestView } from '$lib/domain/requests';
import type { ActivityEvent, Household, Task } from '$lib/domain/types';
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

const MOM: NewMemberProfile = {
  displayName: 'מיכל',
  photoURL: null,
  color: 'sage',
  addressAs: 'f'
};
const DAD: NewMemberProfile = { ...MOM, displayName: 'דני', color: 'slate', addressAs: 'm' };

let repo: FirebaseRepo | undefined;

beforeAll(async () => {
  await clearEmulators();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await repo?.dispose();
  repo = undefined;
});

/** Writes fields as an admin (rules bypassed): the previous app version's stored shape. */
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

/** Mom's household with dad in it; signed in as dad afterwards. */
async function household(r: FirebaseRepo, run: string) {
  const mom = `mom-${run}`;
  const dad = `dad-${run}`;
  await r.signInWithTestCredential(mom, 'מיכל');
  const hid = await r.createHousehold('הבית שלנו', MOM);
  const { code } = await r.createInvite(hid);
  await r.signInWithTestCredential(dad, 'דני');
  await r.joinHousehold(code, DAD);
  return { hid, mom, dad };
}

describe('requests (Firebase adapter)', () => {
  it('a request stored by the previous app version reads as theirs and still updates', async () => {
    const r = (repo = await createTestRepository());
    const { hid, mom, dad } = await household(r, `legacy-${Date.now().toString(36)}`);
    await r.signInWithTestCredential(mom, 'מיכל');
    const id = r.createTask(hid, { title: 'לתקן את הברז' });
    const tasks = record<Task[]>((cb) => r.watchOpenTasks(hid, cb));
    await eventually(() => tasks.last()?.some((t) => t.id === id && !t.pending), 'created');
    // A plain task has no requestedOf key at all, like every document of the previous version.
    expect(await serverDoc(`households/${hid}/tasks/${id}`)).not.toHaveProperty('requestedOf');

    // The previous version's request: ownerId = the asked member, requestedOf never written.
    await adminPatch(`households/${hid}/tasks/${id}`, {
      ownerId: { stringValue: dad },
      requestedBy: { stringValue: mom },
      requestedAt: { timestampValue: new Date().toISOString() }
    });
    const legacy = await eventually(
      () => tasks.last()?.find((t) => t.id === id && t.ownerId === dad),
      'the legacy request'
    );
    expect(legacy.requestedOf).toBeNull();
    expect(requestView(legacy, dad, [mom, dad])).toEqual({
      kind: 'accepted',
      by: mom,
      owner: dad
    });

    // The new client edits and releases it under the new rules.
    await r.signInWithTestCredential(dad, 'דני');
    const errors: RepoError[] = [];
    const stop = r.onWriteError((e) => errors.push(e));
    r.updateTask(hid, id, { notes: 'הברז במטבח' });
    r.releaseTask(hid, id);
    await eventually(async () => {
      const d = await serverDoc(`households/${hid}/tasks/${id}`);
      return restValue(d?.ownerId) === null && restValue(d?.notes) === 'הברז במטבח';
    }, 'released on the server');
    stop();
    tasks.stop();
    expect(errors).toEqual([]);
  });

  it('a new request stores requestedOf; the asked member answers offline and it syncs', async () => {
    const r = (repo = await createTestRepository());
    const { hid, mom, dad } = await household(r, `offline-${Date.now().toString(36)}`);
    await r.signInWithTestCredential(mom, 'מיכל');
    const yes = r.createTask(hid, { title: 'לאסוף חבילה', ownerId: dad });
    const no = r.createTask(hid, { title: 'לקנות מתנה', ownerId: dad });
    await eventually(async () => {
      const d = await serverDoc(`households/${hid}/tasks/${no}`);
      return restValue(d?.requestedOf) === dad && restValue(d?.ownerId) === null;
    }, 'the requests on the server');

    await r.signInWithTestCredential(dad, 'דני');
    const errors: RepoError[] = [];
    const stopErrors = r.onWriteError((e) => errors.push(e));
    const hh = record<Household>((cb) => r.watchHousehold(hid, cb));
    const tasks = record<Task[]>((cb) => r.watchOpenTasks(hid, cb));
    const events = record<ActivityEvent[]>((cb) => r.watchRecentEvents(hid, 50, cb));
    await eventually(
      () =>
        hh.last() !== undefined &&
        tasks.last()?.filter((t) => t.requestedOf === dad && !t.pending).length === 2,
      'both requests cached'
    );

    // ── offline: the answers are queued and shown at once ──
    vi.stubGlobal('navigator', { onLine: false, userAgent: 'node' });
    await disableNetwork(r.firestore as Firestore);
    expect(await r.acceptRequest(hid, yes)).toEqual({ ok: true });
    r.declineRequest(hid, no);
    await eventually(
      () =>
        tasks.last()?.some((t) => t.id === yes && t.ownerId === dad && t.requestedBy === mom) &&
        tasks.last()?.some((t) => t.id === no && t.requestedOf === null && t.requestedBy === null),
      'answers shown offline'
    );

    // ── online ──
    vi.unstubAllGlobals();
    await enableNetwork(r.firestore as Firestore);
    await eventually(async () => {
      const a = await serverDoc(`households/${hid}/tasks/${yes}`);
      const d = await serverDoc(`households/${hid}/tasks/${no}`);
      return (
        restValue(a?.ownerId) === dad &&
        restValue(a?.requestedOf) === null &&
        restValue(a?.requestedBy) === mom &&
        restValue(d?.requestedOf) === null &&
        restValue(d?.requestedBy) === null &&
        restValue(d?.ownerId) === null
      );
    }, 'answers on the server');
    const evs = await eventually(() => {
      const es = events.last() ?? [];
      const answers = es.filter((e) => e.type === 'accepted' || e.type === 'declined');
      return answers.length === 2 ? es : null;
    }, 'answer events');
    for (const [type, taskId] of [
      ['accepted', yes],
      ['declined', no]
    ] as const) {
      expect(evs.find((e) => e.type === type)).toMatchObject({
        actorId: dad,
        taskId,
        targetId: mom,
        push: 'pending'
      });
    }
    stopErrors();
    hh.stop();
    tasks.stop();
    events.stop();
    expect(errors).toEqual([]);
  });
});
