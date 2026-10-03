// owner: step 2.3 — a signed-in outsider (EVE) or a signed-out client can read and write nothing in a
// household; members can read everything in their own household and nothing in another one.

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import {
  ALICE,
  BOB,
  EVE,
  OTHER_HID,
  as,
  eventDoc,
  path,
  photoDoc,
  seed,
  seedTask,
  seedTwoMemberHousehold,
  taskDoc,
  touched,
  treatDoc,
  useRulesEnv
} from './factories';

const env = useRulesEnv();

beforeEach(async () => {
  await seedTwoMemberHousehold(env());
  await seedTask(env(), 'task-1');
  await seed(env(), async (db) => {
    await setDoc(doc(db, path.event('ev-1')), eventDoc(ALICE));
    await setDoc(doc(db, path.photo('ph-1')), photoDoc(ALICE));
    await setDoc(doc(db, path.treat(1)), treatDoc());
    await setDoc(doc(db, path.sent('ev:1:bob')), { at: 1, expireAt: 2 });
  });
});

const docPaths = {
  household: path.household(),
  member: path.member(ALICE),
  task: path.task('task-1'),
  event: path.event('ev-1'),
  photo: path.photo('ph-1'),
  treat: path.treat(1)
};
const collPaths = {
  members: path.members(),
  tasks: path.tasks(),
  events: path.events(),
  photos: path.photos(),
  treats: path.treats()
};

describe('reads: member allowed, outsider and signed-out denied', () => {
  for (const [name, p] of Object.entries(docPaths)) {
    it(`get ${name}: member allowed`, async () => {
      await assertSucceeds(getDoc(doc(as(env(), BOB), p)));
    });
    it(`get ${name}: signed-in outsider denied`, async () => {
      await assertFails(getDoc(doc(as(env(), EVE), p)));
    });
    it(`get ${name}: signed-out denied`, async () => {
      await assertFails(getDoc(doc(as(env(), null), p)));
    });
  }

  for (const [name, p] of Object.entries(collPaths)) {
    it(`list ${name}: member allowed`, async () => {
      await assertSucceeds(getDocs(collection(as(env(), BOB), p)));
    });
    it(`list ${name}: signed-in outsider denied`, async () => {
      await assertFails(getDocs(collection(as(env(), EVE), p)));
    });
    it(`list ${name}: signed-out denied`, async () => {
      await assertFails(getDocs(collection(as(env(), null), p)));
    });
  }

  it('the memory query (status==done, completedAt desc) is allowed for members only', async () => {
    const q = (uid: string) =>
      query(
        collection(as(env(), uid), path.tasks()),
        where('status', '==', 'done'),
        orderBy('completedAt', 'desc'),
        limit(20)
      );
    await assertSucceeds(getDocs(q(BOB)));
    await assertFails(getDocs(q(EVE)));
  });

  it('a member cannot read another household', async () => {
    await assertFails(getDoc(doc(as(env(), BOB), path.household(OTHER_HID))));
    await assertFails(getDocs(collection(as(env(), BOB), path.tasks(OTHER_HID))));
  });
});

describe('households are never listable', () => {
  it('denied even for a member, even filtered to their own membership', async () => {
    const db = as(env(), ALICE);
    await assertFails(getDocs(collection(db, 'households')));
    await assertFails(
      getDocs(query(collection(db, 'households'), where('memberIds', 'array-contains', ALICE)))
    );
  });
  it('denied for an outsider', async () => {
    await assertFails(getDocs(collection(as(env(), EVE), 'households')));
  });
});

describe('collection-group queries are denied', () => {
  for (const group of ['members', 'tasks', 'events', 'photos', 'treats', 'sent', 'devices']) {
    it(`collectionGroup(${group}) denied for a member and an outsider`, async () => {
      await assertFails(getDocs(collectionGroup(as(env(), ALICE), group)));
      await assertFails(getDocs(collectionGroup(as(env(), EVE), group)));
    });
  }
});

describe('writes by an outsider are denied (member counterparts are in the per-collection files)', () => {
  it('create task', async () => {
    await assertFails(setDoc(doc(as(env(), EVE), path.task('t-eve')), taskDoc(EVE)));
  });
  it('update task', async () => {
    await assertFails(
      updateDoc(doc(as(env(), EVE), path.task('task-1')), { title: 'x', ...touched(EVE) })
    );
  });
  it('delete task', async () => {
    await assertFails(deleteDoc(doc(as(env(), EVE), path.task('task-1'))));
  });
  it('create event', async () => {
    await assertFails(setDoc(doc(as(env(), EVE), path.event('ev-eve')), eventDoc(EVE)));
  });
  it('create photo', async () => {
    await assertFails(setDoc(doc(as(env(), EVE), path.photo('ph-eve')), photoDoc(EVE)));
  });
  it('delete photo', async () => {
    await assertFails(deleteDoc(doc(as(env(), EVE), path.photo('ph-1'))));
  });
  it('update treat', async () => {
    await assertFails(updateDoc(doc(as(env(), EVE), path.treat(1)), { redeemedAt: null }));
  });
  it('rename household', async () => {
    await assertFails(updateDoc(doc(as(env(), EVE), path.household()), { name: 'שלי' }));
  });
  it('delete a member', async () => {
    await assertFails(deleteDoc(doc(as(env(), EVE), path.member(BOB))));
  });
  it('signed-out create task', async () => {
    await assertFails(setDoc(doc(as(env(), null), path.task('t-anon')), taskDoc('anon')));
  });
});
