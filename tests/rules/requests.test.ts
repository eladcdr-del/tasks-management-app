// Requests (docs/firestore-schema.md "Requests"): a request is a proposal until the asked member
// answers. `requestedOf` names them while it waits; nobody holds the task meanwhile. Covers the new
// client's writes AND every write of the previous app version (which never touches requestedOf and
// asked by setting ownerId to the asked member), so phones that have not updated keep working.

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import {
  ALICE,
  BOB,
  EVE,
  OLGA,
  as,
  completionDoc,
  eventDoc,
  leaveBatch,
  path,
  seedHousehold,
  seedTask,
  taskDoc,
  touched,
  useRulesEnv,
  type Doc
} from './factories';

const env = useRulesEnv();

/** A third member of HID. */
const CAROL = 'carol-uid';
const ASKED_AT = () => Timestamp.fromMillis(Date.now() - 60_000);

beforeEach(async () => {
  await seedHousehold(env(), { members: [ALICE, BOB, CAROL] });
  await seedHousehold(env(), { hid: 'hhBravo0000000000002', members: [OLGA], code: null });
});

/** ALICE asked BOB; BOB has not answered (nobody holds it). */
const waiting = (over: Doc = {}) =>
  seedTask(env(), 'task-1', {
    ownerId: null,
    requestedOf: BOB,
    requestedBy: ALICE,
    requestedAt: ASKED_AT(),
    ...over
  });

const update = (uid: string, patch: Doc, id = 'task-1') =>
  updateDoc(doc(as(env(), uid), path.task(id)), { ...touched(uid), ...patch });

const create = (uid: string, over: Doc, id = 'new-task') =>
  setDoc(doc(as(env(), uid), path.task(id)), taskDoc(uid, over));

const ask = (by: string, to: string): Doc => ({
  ownerId: null,
  requestedOf: to,
  requestedBy: by,
  requestedAt: serverTimestamp()
});

describe('create', () => {
  it('allowed: a task created as a request waiting for another member', async () => {
    await assertSucceeds(create(ALICE, ask(ALICE, BOB)));
  });
  it('allowed: an explicit requestedOf null', async () => {
    await assertSucceeds(create(ALICE, { requestedOf: null }));
  });
  it('allowed (previous app version): a request as ownerId = the asked member, no requestedOf', async () => {
    await assertSucceeds(
      create(ALICE, { ownerId: BOB, requestedBy: ALICE, requestedAt: serverTimestamp() })
    );
  });

  const invalid: Array<[string, Doc]> = [
    ['asking myself', ask(ALICE, ALICE)],
    ['asking an outsider', ask(ALICE, EVE)],
    ['asking a member of another household', ask(ALICE, OLGA)],
    ['someone already holds it', { ...ask(ALICE, BOB), ownerId: BOB }],
    ['requestedBy someone else', { ...ask(ALICE, BOB), requestedBy: CAROL }],
    ['requestedBy missing', { ...ask(ALICE, BOB), requestedBy: null, requestedAt: null }],
    ['a client-side requestedAt', { ...ask(ALICE, BOB), requestedAt: Timestamp.fromMillis(0) }],
    ['requestedOf a number', { requestedOf: 42 }],
    ['requestedOf empty', { requestedOf: '' }],
    ['requestedOf a list', { requestedOf: [BOB] }]
  ];
  for (const [label, over] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(create(ALICE, over));
    });
  }
});

describe('asking (update)', () => {
  beforeEach(async () => {
    await seedTask(env(), 'task-1', { ownerId: CAROL });
  });

  it('allowed: ask a member; whoever held the task lets go until they answer', async () => {
    await assertSucceeds(update(ALICE, ask(ALICE, BOB)));
  });
  it('allowed (previous app version): ownerId = the asked member at once', async () => {
    await assertSucceeds(
      update(ALICE, { ownerId: BOB, requestedBy: ALICE, requestedAt: serverTimestamp() })
    );
  });
  it('allowed: asking on a document written before requestedOf existed', async () => {
    await seedTask(env(), 'legacy', {});
    await assertSucceeds(update(ALICE, ask(ALICE, BOB), 'legacy'));
  });

  const invalid: Array<[string, Doc]> = [
    ['asking myself', ask(ALICE, ALICE)],
    ['asking an outsider', ask(ALICE, EVE)],
    ['asking a member of another household', ask(ALICE, OLGA)],
    ['the holder keeps it', { ...ask(ALICE, BOB), ownerId: CAROL }],
    ['in someone else’s name', { ...ask(ALICE, BOB), requestedBy: CAROL }],
    ['without requestedBy', { ...ask(ALICE, BOB), requestedBy: null, requestedAt: null }],
    ['a client-side requestedAt', { ...ask(ALICE, BOB), requestedAt: Timestamp.fromMillis(0) }],
    ['requestedOf a number', { requestedOf: 7 }]
  ];
  for (const [label, patch] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(update(ALICE, patch));
    });
  }
});

describe('a request waiting for BOB', () => {
  beforeEach(async () => {
    await waiting();
  });

  // ── the asked member answers ──
  it('allowed: BOB accepts (his; the request stays as history)', async () => {
    await assertSucceeds(update(BOB, { ownerId: BOB, requestedOf: null }));
  });
  it('allowed: BOB declines (waits for anyone)', async () => {
    await assertSucceeds(update(BOB, { requestedOf: null, requestedBy: null, requestedAt: null }));
  });

  // ── the asker ──
  it('allowed: ALICE withdraws it', async () => {
    await assertSucceeds(
      update(ALICE, { requestedOf: null, requestedBy: null, requestedAt: null })
    );
  });
  it('allowed: ALICE asks someone else instead', async () => {
    await assertSucceeds(update(ALICE, ask(ALICE, CAROL)));
  });

  // ── anyone else ──
  it('allowed: CAROL takes it (the request goes with it)', async () => {
    await assertSucceeds(
      update(CAROL, { ownerId: CAROL, requestedOf: null, requestedBy: null, requestedAt: null })
    );
  });
  it('allowed: ALICE (the asker) takes it herself', async () => {
    await assertSucceeds(
      update(ALICE, { ownerId: ALICE, requestedOf: null, requestedBy: null, requestedAt: null })
    );
  });
  it('allowed: CAROL asks someone (again)', async () => {
    await assertSucceeds(update(CAROL, ask(CAROL, ALICE)));
    await waiting();
    await assertSucceeds(update(CAROL, ask(CAROL, BOB)));
  });
  it('allowed: CAROL edits, snoozes, completes and reopens it with the request untouched', async () => {
    await assertSucceeds(update(CAROL, { title: 'כותרת חדשה', notes: 'עם פרטים' }));
    await assertSucceeds(
      update(CAROL, {
        scheduledFor: '2026-10-08',
        snoozeCount: increment(1),
        lastSnoozedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      update(CAROL, {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: CAROL,
        completion: completionDoc()
      })
    );
    await assertSucceeds(
      update(CAROL, { status: 'open', completedAt: null, completedBy: null, completion: null })
    );
  });

  // ── the previous app version, which sees an unowned task ──
  it('allowed (previous app version): CAROL takes it, requestedOf left as it was', async () => {
    await assertSucceeds(update(CAROL, { ownerId: CAROL, requestedBy: null, requestedAt: null }));
  });
  it('allowed (previous app version): CAROL asks ALICE as ownerId = ALICE', async () => {
    await assertSucceeds(
      update(CAROL, { ownerId: ALICE, requestedBy: CAROL, requestedAt: serverTimestamp() })
    );
  });
  it('allowed (previous app version): ALICE asks BOB again as ownerId = BOB', async () => {
    await assertSucceeds(
      update(ALICE, { ownerId: BOB, requestedBy: ALICE, requestedAt: serverTimestamp() })
    );
  });

  const invalid: Array<[string, string, Doc]> = [
    [
      'CAROL withdraws ALICE’s request',
      CAROL,
      { requestedOf: null, requestedBy: null, requestedAt: null }
    ],
    [
      'CAROL clears requestedBy only (a withdrawal in disguise)',
      CAROL,
      { requestedBy: null, requestedAt: null }
    ],
    [
      'CAROL accepts in BOB’s place (takes it, keeps the request)',
      CAROL,
      { ownerId: CAROL, requestedOf: null }
    ],
    ['CAROL hands it to BOB without his answer', CAROL, { ownerId: BOB }],
    ['CAROL hands it to BOB, clearing requestedOf', CAROL, { ownerId: BOB, requestedOf: null }],
    ['ALICE hands it to BOB, clearing requestedOf', ALICE, { ownerId: BOB, requestedOf: null }],
    [
      'CAROL redirects it to an outsider',
      CAROL,
      { requestedOf: EVE, requestedBy: CAROL, requestedAt: serverTimestamp() }
    ],
    ['CAROL redirects it in ALICE’s name', CAROL, { requestedOf: CAROL }],
    ['ALICE redirects it without a new request time', ALICE, { requestedOf: CAROL }],
    ['an outsider answers', EVE, { ownerId: EVE, requestedOf: null }]
  ];
  for (const [label, uid, patch] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(update(uid, patch));
    });
  }
});

describe('stale and finished requests', () => {
  it('allowed: anyone clears a request to a former member', async () => {
    await waiting({ requestedOf: 'gone-uid' });
    await assertSucceeds(
      update(CAROL, { requestedOf: null, requestedBy: null, requestedAt: null })
    );
  });
  it('allowed: anyone clears a stale requestedOf on a task someone holds', async () => {
    // The previous app version took it without touching requestedOf.
    await waiting({ ownerId: CAROL, requestedBy: null, requestedAt: null });
    await assertSucceeds(update(CAROL, { ownerId: null, requestedOf: null }));
  });
  it('allowed: the holder of an accepted request releases it', async () => {
    await waiting({ ownerId: BOB, requestedOf: null });
    await assertSucceeds(
      update(BOB, { ownerId: null, requestedBy: null, requestedAt: null, requestedOf: null })
    );
  });
});

describe('leave batch', () => {
  it('allowed: BOB leaves with a request waiting for him (answered no) and a task of his', async () => {
    await waiting();
    await seedTask(env(), 'task-2', { ownerId: BOB });
    const db = as(env(), BOB);
    const b = leaveBatch(db, BOB, undefined, ['task-2']);
    b.update(doc(db, path.task('task-1')), {
      requestedOf: null,
      requestedBy: null,
      requestedAt: null,
      ...touched(BOB)
    });
    await assertSucceeds(b.commit());
  });
});

// ── answer events (push to the asker) ─────────────────────────────────────────

describe('accepted / declined events', () => {
  beforeEach(async () => {
    await waiting();
  });

  const answer = (db: Firestore, uid: string, type: string, task: Doc | null, ev: Doc = {}) => {
    const b = writeBatch(db);
    if (task) b.update(doc(db, path.task('task-1')), { ...touched(uid), ...task });
    b.set(doc(db, path.event(`ev-${type}`)), eventDoc(uid, type, { targetId: ALICE, ...ev }));
    return b.commit();
  };
  const ACCEPT = { ownerId: BOB, requestedOf: null };
  const DECLINE = { requestedOf: null, requestedBy: null, requestedAt: null };

  it('allowed: accept + accepted event (push pending, targetId = the asker)', async () => {
    await assertSucceeds(answer(as(env(), BOB), BOB, 'accepted', ACCEPT));
  });
  it('allowed: accept in a transaction (the online path)', async () => {
    const db = as(env(), BOB);
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(doc(db, path.task('task-1')));
        await tx.get(doc(db, path.household()));
        tx.update(doc(db, path.task('task-1')), { ...touched(BOB), ...ACCEPT });
        tx.set(doc(db, path.event('ev-acc')), eventDoc(BOB, 'accepted', { targetId: ALICE }));
      })
    );
  });
  it('allowed: decline + declined event', async () => {
    await assertSucceeds(answer(as(env(), BOB), BOB, 'declined', DECLINE));
  });

  const invalid: Array<[string, string, string, Doc | null, Doc]> = [
    ['accepted without taking the task', BOB, 'accepted', null, {}],
    ['accepted by someone who does not hold it after', CAROL, 'accepted', { title: 'x' }, {}],
    ['declined without answering', BOB, 'declined', null, {}],
    ['declined by someone the request did not wait for', CAROL, 'declined', null, {}],
    ['accepted with push none', BOB, 'accepted', ACCEPT, { push: 'none' }],
    ['declined with push none', BOB, 'declined', DECLINE, { push: 'none' }],
    ['targetId null', BOB, 'accepted', ACCEPT, { targetId: null }],
    ['targetId myself', BOB, 'accepted', ACCEPT, { targetId: BOB }],
    ['targetId an outsider', BOB, 'accepted', ACCEPT, { targetId: EVE }],
    ['taskId null', BOB, 'declined', DECLINE, { taskId: null }],
    ['taskId of a missing task', BOB, 'accepted', ACCEPT, { taskId: 'no-such-task' }],
    ['taskId not a document id', BOB, 'accepted', ACCEPT, { taskId: 'a/b' }]
  ];
  for (const [label, uid, type, task, ev] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(answer(as(env(), uid), uid, type, task, ev));
    });
  }

  it('allowed: a withdrawal by the asker writes a quiet released event naming the asked member', async () => {
    const db = as(env(), ALICE);
    const b = writeBatch(db);
    b.update(doc(db, path.task('task-1')), { ...touched(ALICE), ...DECLINE });
    b.set(doc(db, path.event('ev-rel')), eventDoc(ALICE, 'released', { targetId: BOB }));
    await assertSucceeds(b.commit());
  });
});
