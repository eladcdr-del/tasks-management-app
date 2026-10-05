// Leaving as the last member (Firebase adapter, rules enforced): the household is emptied and its
// invite closed for good. Besides household.invite = null, the invites/{code} document itself is
// revoked in the same batch, so a link that was already sent explains itself ("cancelled") instead
// of falling through to the "the house is full" message.

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
const DAD: NewMemberProfile = { ...MOM, displayName: 'דני', color: 'slate', addressAs: 'm' };

let repo: FirebaseRepo | undefined;

beforeAll(async () => {
  await clearEmulators();
});

afterEach(async () => {
  await repo?.dispose();
  repo = undefined;
});

describe('leaveHousehold (last member)', () => {
  it('revokes the open invite, so a link already sent says it was cancelled', async () => {
    const r = (repo = await createTestRepository());
    const run = Date.now().toString(36);
    await r.signInWithTestCredential(`mom-${run}`, 'מיכל');
    const hid = await r.createHousehold('הבית שלנו', MOM);
    const { code } = await r.createInvite(hid);

    await r.leaveHousehold(hid);

    const house = await serverDoc(`households/${hid}`);
    expect(restValue(house?.memberIds)).toEqual([]);
    expect(restValue(house?.invite)).toBeNull();
    expect(restValue((await serverDoc(`invites/${code}`))?.revoked)).toBe(true);

    // Dad opens the link mom sent earlier.
    await r.signInWithTestCredential(`dad-${run}`, 'דני');
    await expect(r.previewInvite(code)).rejects.toMatchObject({ code: 'revoked' });
    await expect(r.joinHousehold(code, DAD)).rejects.toMatchObject({ code: 'revoked' });
  });

  it('a member who is not the last leaves the invite alone', async () => {
    const r = (repo = await createTestRepository());
    const run = Date.now().toString(36);
    await r.signInWithTestCredential(`mom2-${run}`, 'מיכל');
    const hid = await r.createHousehold('הבית שלנו', MOM);
    const { code } = await r.createInvite(hid);
    await r.signInWithTestCredential(`dad2-${run}`, 'דני');
    await r.joinHousehold(code, DAD);

    await r.leaveHousehold(hid);

    expect(restValue((await serverDoc(`invites/${code}`))?.revoked)).toBe(false);
    expect(restValue((await serverDoc(`households/${hid}`))?.memberIds)).toEqual([`mom2-${run}`]);
  });
});
