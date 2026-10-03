// owner: step 2.3 — households/{hid}/members/{uid}: member reads, self-only profile updates, field
// validation, immutable role / joinedAt / inviteCode. (Create is covered by the founder and join
// batches in households.test.ts and join-leave.test.ts.)

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  ALICE,
  BOB,
  CODE,
  EVE,
  OLGA,
  OTHER_HID,
  as,
  memberDoc,
  notifyPrefs,
  path,
  seedTwoMemberHousehold,
  useRulesEnv
} from './factories';

const env = useRulesEnv();

beforeEach(async () => {
  await seedTwoMemberHousehold(env());
});

describe('read', () => {
  it('allowed: a member reads any member of their household', async () => {
    await assertSucceeds(getDoc(doc(as(env(), BOB), path.member(ALICE))));
  });
  it('denied: outsider, or a member of another household', async () => {
    await assertFails(getDoc(doc(as(env(), EVE), path.member(ALICE))));
    await assertFails(getDoc(doc(as(env(), OLGA), path.member(ALICE))));
    await assertFails(getDoc(doc(as(env(), BOB), path.member(OLGA, OTHER_HID))));
  });
});

describe('self update', () => {
  const mine = () => doc(as(env(), BOB), path.member(BOB));

  it('allowed: displayName, photoURL, color, addressAs, notify', async () => {
    await assertSucceeds(
      updateDoc(mine(), {
        displayName: 'דניאל',
        photoURL: null,
        color: 'teal',
        addressAs: 'n',
        notify: notifyPrefs({ weekly: false })
      })
    );
    await assertSucceeds(
      updateDoc(mine(), { photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocK=s96-c' })
    );
  });

  it('denied: escalating role to owner', async () => {
    await assertFails(updateDoc(mine(), { role: 'owner' }));
  });
  it('denied: changing joinedAt or inviteCode', async () => {
    await assertFails(updateDoc(mine(), { joinedAt: serverTimestamp() }));
    await assertFails(updateDoc(mine(), { inviteCode: null }));
  });
  it("denied: editing another member's profile (even as the owner)", async () => {
    await assertFails(updateDoc(doc(as(env(), BOB), path.member(ALICE)), { displayName: 'x' }));
    await assertFails(updateDoc(doc(as(env(), ALICE), path.member(BOB)), { color: 'plum' }));
  });
  it('denied: rewriting another member doc wholesale', async () => {
    await assertFails(
      setDoc(doc(as(env(), ALICE), path.member(BOB)), memberDoc('member', CODE, { color: 'plum' }))
    );
  });

  const invalid: Array<[string, Record<string, unknown>]> = [
    ['empty displayName', { displayName: '' }],
    ['41-char displayName', { displayName: 'ד'.repeat(41) }],
    ['color outside the enum', { color: 'pink' }],
    ['addressAs outside the enum', { addressAs: 'x' }],
    ['notify with 3 keys', { notify: { requests: true, reminders: true, partnerDone: true } }],
    ['notify with a non-bool', { notify: notifyPrefs({ weekly: 'yes' }) }],
    ['notify with an extra key', { notify: notifyPrefs({ marketing: true }) }],
    ['photoURL as a data: URL', { photoURL: 'data:image/png;base64,AAAA' }],
    ['photoURL as javascript:', { photoURL: 'javascript:alert(1)' }],
    [
      'photoURL over 2048 chars',
      {
        photoURL: 'https://lh3.googleusercontent.com/' + 'a'.repeat(2020)
      }
    ],
    ['photoURL on another host (tracking pixel)', { photoURL: 'https://evil.example/p.gif' }],
    ['photoURL host spoof', { photoURL: 'https://googleusercontent.com.evil.example/p.gif' }],
    ['photoURL over http', { photoURL: 'http://lh3.googleusercontent.com/a/x' }],
    ['an unknown extra key', { bio: 'hi' }],
    ['a stored uid field', { uid: BOB }]
  ];
  for (const [label, patch] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(updateDoc(mine(), patch));
    });
  }
});
