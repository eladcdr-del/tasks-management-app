// "בדיקת התראות" (Firebase adapter, rules enforced): requestTestPush stores testPushAt on this
// device's doc as epoch millis (an integer the notifier turns into its dedupe key), and the token
// refresh of the previous app version (registerDevice, merge) keeps working on that doc.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NewMemberProfile } from '$lib/data/repository';
import {
  clearEmulators,
  createTestRepository,
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

let repo: FirebaseRepo | undefined;

beforeAll(async () => {
  await clearEmulators();
});

afterEach(async () => {
  await repo?.dispose();
  repo = undefined;
});

describe('requestTestPush', () => {
  it('writes testPushAt (client epoch ms) on this device and keeps the rest of the doc', async () => {
    const r = (repo = await createTestRepository());
    const uid = `mom-${Date.now().toString(36)}`;
    await r.signInWithTestCredential(uid, 'מיכל');
    const hid = await r.createHousehold('הבית שלנו', MOM);
    await r.registerDevice({
      deviceId: 'phone-1',
      householdId: hid,
      token: 'tok-1',
      userAgent: 'x'
    });
    const before = await serverDoc(`users/${uid}/devices/phone-1`);

    const t0 = Date.now();
    await r.requestTestPush('phone-1');
    const after = await serverDoc(`users/${uid}/devices/phone-1`);
    expect(after?.testPushAt).toHaveProperty('integerValue');
    const at = restValue(after?.testPushAt) as number;
    expect(at).toBeGreaterThanOrEqual(t0);
    expect(at).toBeLessThanOrEqual(Date.now());
    expect(restValue(after?.token)).toBe('tok-1');
    expect(restValue(after?.householdId)).toBe(hid);
    expect(restValue(after?.createdAt)).toBe(restValue(before?.createdAt));

    // The token refresh merges onto the doc: the request stays until the notifier's window ends.
    await r.registerDevice({
      deviceId: 'phone-1',
      householdId: hid,
      token: 'tok-2',
      userAgent: 'x'
    });
    const refreshed = await serverDoc(`users/${uid}/devices/phone-1`);
    expect(restValue(refreshed?.token)).toBe('tok-2');
    expect(restValue(refreshed?.testPushAt)).toBe(at);
  });

  it('refuses a device that is not registered, without creating it', async () => {
    const r = (repo = await createTestRepository());
    const uid = `dad-${Date.now().toString(36)}`;
    await r.signInWithTestCredential(uid, 'דני');
    await r.createHousehold('הבית שלנו', { ...MOM, displayName: 'דני', addressAs: 'm' });
    await expect(r.requestTestPush('ghost')).rejects.toMatchObject({ code: 'not-found' });
    expect(await serverDoc(`users/${uid}/devices/ghost`)).toBeNull();
  });
});
