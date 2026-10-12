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
  founderBatch,
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

// member.notify: the four original switches are required, newTasks / soon / overdue are optional
// bools (the previous app version writes only the four).
describe('notify switches', () => {
  const mine = () => doc(as(env(), BOB), path.member(BOB));
  const seven = (overrides: Record<string, unknown> = {}) =>
    notifyPrefs({ newTasks: true, soon: true, overdue: true, ...overrides });

  it('allowed: the four original keys (the previous app version)', async () => {
    await assertSucceeds(updateDoc(mine(), { notify: notifyPrefs({ reminders: false }) }));
  });
  it('allowed: all seven keys', async () => {
    await assertSucceeds(updateDoc(mine(), { notify: seven({ soon: false }) }));
  });
  it('allowed: the four plus only some of the new ones', async () => {
    await assertSucceeds(updateDoc(mine(), { notify: notifyPrefs({ overdue: false }) }));
  });
  it('allowed: an update that toggles only a new key', async () => {
    await assertSucceeds(updateDoc(mine(), { notify: seven() }));
    await assertSucceeds(updateDoc(mine(), { notify: seven({ newTasks: false }) }));
    await assertSucceeds(updateDoc(mine(), { 'notify.overdue': false }));
  });
  it('allowed: a founder creates their member doc with all seven', async () => {
    const NEW_HID = 'hhNew000000000000004';
    await assertSucceeds(
      founderBatch(as(env(), EVE), EVE, NEW_HID, {
        member: memberDoc('owner', null, { notify: seven() })
      }).commit()
    );
  });

  const denied: Array<[string, Record<string, unknown>]> = [
    ['a non-bool newTasks', seven({ newTasks: 'yes' })],
    ['a non-bool soon', notifyPrefs({ soon: 1 })],
    ['a null overdue', seven({ overdue: null })],
    ['an unknown extra key next to the seven', seven({ marketing: true })],
    [
      'the new keys without an original one',
      {
        reminders: true,
        partnerDone: true,
        weekly: true,
        newTasks: true,
        soon: true,
        overdue: true
      }
    ]
  ];
  for (const [label, notify] of denied) {
    it(`denied: ${label}`, async () => {
      await assertFails(updateDoc(mine(), { notify }));
    });
  }
  it('denied: a non-bool new key set on its own', async () => {
    await assertFails(updateDoc(mine(), { 'notify.soon': 'later' }));
  });
});
