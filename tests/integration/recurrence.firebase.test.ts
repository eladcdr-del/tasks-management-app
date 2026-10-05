// Flexible recurring tasks against the Firebase adapter on the emulators, with firestore.rules
// ENFORCED: the shared recurrence contract, plus the exact stored shape (what an older client reads)
// and a document in the pre-feature shape loading, updating and completing as before.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addDays, todayISO } from '$lib/domain/dates';
import { runRecurrenceContract } from '../contract/recurrenceContract';
import {
  clearEmulators,
  createTestRepository,
  eventually,
  restValue,
  serverDoc,
  type FirebaseRepo
} from './emulator';

beforeAll(async () => {
  await clearEmulators();
});

const nameOf = (uid: string) => uid.split('-')[0] || uid;

runRecurrenceContract(
  'firebase',
  async () => {
    const repo = await createTestRepository();
    return {
      repo,
      asUser: (uid: string) => repo.signInWithTestCredential(uid, nameOf(uid)),
      interactiveSignIn: false,
      cleanup: () => repo.dispose()
    };
  },
  { timeoutMs: 10_000 }
);

describe('stored recurrence shape (Firebase adapter)', () => {
  let repo: FirebaseRepo | undefined;
  afterEach(async () => {
    await repo?.dispose();
    repo = undefined;
  });

  async function household() {
    const r = (repo = await createTestRepository());
    const uid = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await r.signInWithTestCredential(uid, 'מיכל');
    const hid = await r.createHousehold('הבית', {
      displayName: 'מיכל',
      photoURL: null,
      color: 'terracotta',
      addressAs: 'f'
    });
    return { r, hid };
  }

  const storedRecurrence = async (hid: string, id: string) =>
    restValue(
      (await eventually(() => serverDoc(`households/${hid}/tasks/${id}`), `task ${id}`)).recurrence
    );

  it('writes interval as an integer and weekdays as a sorted integer list', async () => {
    const { r, hid } = await household();
    const today = todayISO(Date.now());
    const id = r.createTask(hid, {
      title: 'חוג',
      scheduledFor: today,
      recurrence: { freq: 'weekly', interval: 2, weekdays: [4, 1] }
    });
    const raw = await eventually(
      () => serverDoc(`households/${hid}/tasks/${id}`),
      'the stored task'
    );
    const rec = raw.recurrence as { mapValue: { fields: Record<string, Record<string, unknown>> } };
    expect(rec.mapValue.fields.interval).toEqual({ integerValue: '2' });
    expect(rec.mapValue.fields.weekdays).toEqual({
      arrayValue: { values: [{ integerValue: '1' }, { integerValue: '4' }] }
    });
    expect(await storedRecurrence(hid, id)).toEqual({
      freq: 'weekly',
      interval: 2,
      weekdays: [1, 4],
      anchor: today
    });
  });

  it('a plain weekly rule is stored exactly as before the feature: {freq, anchor}', async () => {
    const { r, hid } = await household();
    const due = addDays(todayISO(Date.now()), 3);
    const id = r.createTask(hid, {
      title: 'לשלם',
      dueDate: due,
      recurrence: { freq: 'weekly', interval: 1 }
    });
    expect(await storedRecurrence(hid, id)).toEqual({ freq: 'weekly', anchor: due });
  });

  it('a pre-feature document (no interval/weekdays) updates and completes as before', async () => {
    const { r, hid } = await household();
    const due = addDays(todayISO(Date.now()), 2);
    const id = r.createTask(hid, {
      title: 'ועד בית',
      dueDate: due,
      recurrence: { freq: 'monthly' }
    });
    await eventually(() => serverDoc(`households/${hid}/tasks/${id}`), 'the stored task');
    r.updateTask(hid, id, { notes: 'בהוראת קבע' });
    await eventually(
      async () =>
        restValue((await serverDoc(`households/${hid}/tasks/${id}`))?.notes) === 'בהוראת קבע',
      'the edit'
    );
    expect(await storedRecurrence(hid, id)).toEqual({ freq: 'monthly', anchor: due });
    const { nextTaskId } = await r.completeTask(
      hid,
      id,
      { note: '', cost: null, place: '', contact: '' },
      []
    );
    expect(await storedRecurrence(hid, nextTaskId!)).toEqual({ freq: 'monthly', anchor: due });
  });
});
