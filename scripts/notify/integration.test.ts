// End-to-end against the Firestore emulator with a fake Sender (FCM has no emulator).
// Runs only under `npm run notify:test` (firebase emulators:exec sets FIRESTORE_EMULATOR_HOST);
// a bare `vitest` skips it.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { run, SENT_TTL_DAYS } from './run.ts';
import { DEMO, seedDemo } from './seed.ts';
import type { PushMessage, Sender, SendResult } from './sender.ts';

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-homecare';
const HID = DEMO.householdId;
const MIN = 60_000;
const DAY = 86_400_000;

/** Records every push; tokens can be made invalid or transiently failing. */
class FakeSender implements Sender {
  calls: { tokens: string[]; msg: PushMessage }[] = [];
  invalid = new Set<string>();
  transient = new Set<string>();
  throws = false;

  send(tokens: string[], msg: PushMessage): Promise<SendResult> {
    this.calls.push({ tokens: [...tokens].sort(), msg });
    if (this.throws) return Promise.reject(new Error('FCM unreachable'));
    const invalidTokens = tokens.filter((t) => this.invalid.has(t));
    const transient = tokens.filter((t) => this.transient.has(t));
    return Promise.resolve({
      invalidTokens,
      transientFailures: transient.length,
      errorCodes: [
        ...invalidTokens.map(() => 'messaging/registration-token-not-registered'),
        ...transient.map(() => 'messaging/server-unavailable')
      ]
    });
  }
}

const tok = DEMO.devices;
const summary = (calls: FakeSender['calls']) =>
  calls.map((c) => ({ tokens: c.tokens, title: c.msg.title, body: c.msg.body, url: c.msg.url }));

/** What the demo household should produce on Sunday 08:05 (due-day window, outside quiet hours). */
const FIRST_RUN = [
  // u-dani first (sends are sorted by recipient uid, then type)
  {
    tokens: [tok.daniPhone.token],
    title: 'מיכל סיימה 2 משימות',
    body: 'להוריד את הזבל, לקנות חלב',
    url: 'https://eladcdr-del.github.io/tasks-management-app/#/'
  },
  {
    tokens: [tok.daniPhone.token],
    title: 'הצנצנת התמלאה!',
    body: 'הגיע הזמן לצ׳ופר: ארוחה במסעדה',
    url: 'https://eladcdr-del.github.io/tasks-management-app/#/jar'
  },
  {
    tokens: [tok.daniPhone.token],
    title: 'להיום: לקבוע תור לרופא שיניים',
    body: 'עוד לא נלקחה',
    url: 'https://eladcdr-del.github.io/tasks-management-app/#/task/t-dentist'
  },
  {
    tokens: [tok.michalOld.token, tok.michalPhone.token].sort(),
    title: 'דני ביקש ממך משימה',
    body: 'לאסוף חבילה מהדואר',
    url: 'https://eladcdr-del.github.io/tasks-management-app/#/task/t-parcel'
  },
  {
    // the dead token was deleted after the previous push, so this one goes to one device
    tokens: [tok.michalPhone.token],
    title: '2 משימות להיום',
    body: 'לקבוע תור לרופא שיניים, לשלם ארנונה',
    url: 'https://eladcdr-del.github.io/tasks-management-app/#/'
  }
];

const FIRST_RUN_KEYS = [
  'due:t-arnona:2026-10-04:u-michal',
  'due:t-dentist:2026-10-04:u-dani',
  'due:t-dentist:2026-10-04:u-michal',
  'ev:ev-done-milk:u-dani',
  'ev:ev-done-trash:u-dani',
  'ev:ev-jar:u-dani',
  'ev:ev-req:u-michal'
];

describe.skipIf(!EMULATOR)('notifier ⇄ Firestore emulator', () => {
  let app: App;
  let db: Firestore;
  const NOW = new Date('2026-10-04T08:05:00+03:00'); // Sunday, due-day window
  const later = (minutes: number) => new Date(NOW.getTime() + minutes * MIN);

  beforeAll(() => {
    process.env.METADATA_SERVER_DETECTION ??= 'none'; // no GCE metadata probing (as in index.ts)
    app = initializeApp({ projectId: PROJECT }, 'notify-integration');
    db = getFirestore(app);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
    const res = await fetch(
      `http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
      { method: 'DELETE' }
    );
    expect(res.ok).toBe(true);
  });

  const push = async (eventId: string) =>
    (await db.doc(`households/${HID}/events/${eventId}`).get()).get('push') as string;
  const sentKeys = async () =>
    (await db.collection(`households/${HID}/sent`).get()).docs.map((d) => d.id).sort();
  const exists = async (path: string) => (await db.doc(path).get()).exists;

  it('sends the expected set once, removes dead tokens, marks events; a second run sends nothing', async () => {
    await seedDemo(db, NOW);
    const sender = new FakeSender();
    sender.invalid.add(tok.michalOld.token);

    const r1 = await run({ db, sender, now: NOW });
    expect(r1.errors).toEqual([]);
    expect(summary(sender.calls)).toEqual(FIRST_RUN);
    expect(r1.households[0]?.outcomes.map((o) => o.status)).toEqual(Array(5).fill('delivered'));
    expect(r1.households[0]?.devicesRemoved).toBe(1);

    // dead token gone, live ones kept
    expect(await exists(`users/${tok.michalOld.uid}/devices/${tok.michalOld.deviceId}`)).toBe(
      false
    );
    expect(await exists(`users/${tok.michalPhone.uid}/devices/${tok.michalPhone.deviceId}`)).toBe(
      true
    );
    expect(await exists(`users/${tok.daniPhone.uid}/devices/${tok.daniPhone.deviceId}`)).toBe(true);

    // events settled; the stale completion skipped; a push:'none' event untouched
    expect(await push('ev-req')).toBe('sent');
    expect(await push('ev-done-trash')).toBe('sent');
    expect(await push('ev-done-milk')).toBe('sent');
    expect(await push('ev-jar')).toBe('sent');
    expect(await push('ev-done-stale')).toBe('skipped');
    expect(await push('ev-created')).toBe('none');

    // dedupe log: one doc per key, 45-day expiry
    expect(await sentKeys()).toEqual(FIRST_RUN_KEYS);
    const doc = await db.doc(`households/${HID}/sent/ev:ev-req:u-michal`).get();
    expect((doc.get('at') as Timestamp).toMillis()).toBe(NOW.getTime());
    expect((doc.get('expireAt') as Timestamp).toMillis()).toBe(NOW.getTime() + SENT_TTL_DAYS * DAY);

    // second run, 5 minutes later: the due-day summaries are re-planned but already sent
    const r2 = await run({ db, sender, now: later(5) });
    expect(r2.errors).toEqual([]);
    expect(sender.calls).toHaveLength(5);
    expect(r2.households[0]?.outcomes.map((o) => o.status)).toEqual(['duplicate', 'duplicate']);

    // a crash between push and mark leaves an event pending: the next run must not re-push it
    await db.doc(`households/${HID}/events/ev-req`).update({ push: 'pending' });
    const r3 = await run({ db, sender, now: later(10) });
    expect(sender.calls).toHaveLength(5);
    expect(r3.households[0]?.outcomes.find((o) => o.send.type === 'requested')?.status).toBe(
      'duplicate'
    );
    expect(await push('ev-req')).toBe('sent');
    expect(await sentKeys()).toEqual(FIRST_RUN_KEYS);
  });

  it('a sparse schedule still delivers: a 14:25 first run catches up, later runs add only news', async () => {
    await seedDemo(db, NOW);
    const sender = new FakeSender();
    const sunday = (hhmm: string) => new Date(`2026-10-04T${hhmm}:00+03:00`);

    // no run all morning: the due-day summaries (and the weekly nudge, open since 10:00) still go
    const r1 = await run({ db, sender, now: sunday('14:25') });
    expect(r1.errors).toEqual([]);
    expect(sender.calls.map((c) => c.msg.title)).toEqual([
      ...FIRST_RUN.slice(0, 3).map((c) => c.title),
      'יש משימה אחת שמחכה כבר זמן מה',
      ...FIRST_RUN.slice(3).map((c) => c.title)
    ]);
    expect(await push('ev-done-stale')).toBe('skipped');

    // 18:13: only the day-before reminder is new; everything else is a duplicate
    const r2 = await run({ db, sender, now: sunday('18:13') });
    expect(r2.households[0]?.outcomes.filter((o) => o.status === 'delivered')).toHaveLength(1);
    expect(sender.calls.slice(6).map((c) => [c.tokens, c.msg.title])).toEqual([
      [[tok.daniPhone.token], 'מחר המועד האחרון: להחזיר את החולצה לקניון']
    ]);

    // 21:24: nothing new
    await run({ db, sender, now: sunday('21:24') });
    expect(sender.calls).toHaveLength(7);
  });

  it.each([
    ['the filling completion was undone', { 'jar.count': 9 }],
    [
      'the treat was redeemed already',
      { 'jar.count': 0, 'jar.round': 2, 'jar.startedAt': Timestamp.fromMillis(NOW.getTime() - MIN) }
    ]
  ])('does not announce a full jar when %s', async (_label, jar) => {
    await seedDemo(db, NOW);
    await db.doc(`households/${HID}`).update(jar);
    const sender = new FakeSender();
    await run({ db, sender, now: NOW });
    expect(sender.calls.map((c) => c.msg.title)).not.toContain('הצנצנת התמלאה!');
    expect(await push('ev-jar')).toBe('skipped');
  });

  it('retries a transient failure on the next run, then goes quiet', async () => {
    await seedDemo(db, NOW);
    const sender = new FakeSender();
    sender.transient.add(tok.daniPhone.token);

    const r1 = await run({ db, sender, now: NOW });
    expect(r1.errors).toEqual([]);
    expect(sender.calls).toHaveLength(5);
    const statuses = r1.households[0]?.outcomes.map((o) => [o.send.uid, o.status]);
    expect(statuses).toEqual([
      [DEMO.dani, 'retry'],
      [DEMO.dani, 'retry'],
      [DEMO.dani, 'retry'],
      [DEMO.michal, 'delivered'],
      [DEMO.michal, 'delivered']
    ]);
    // Dani's keys were rolled back and his events stay pending; Michal's are settled
    expect(await sentKeys()).toEqual([
      'due:t-arnona:2026-10-04:u-michal',
      'due:t-dentist:2026-10-04:u-michal',
      'ev:ev-req:u-michal'
    ]);
    expect(await push('ev-done-trash')).toBe('pending');
    expect(await push('ev-done-milk')).toBe('pending');
    expect(await push('ev-jar')).toBe('pending');
    expect(await push('ev-req')).toBe('sent');
    expect(r1.households[0]?.eventsLeftPending).toBe(3);

    // FCM recovers: only Dani's three pushes go out
    sender.transient.clear();
    const r2 = await run({ db, sender, now: later(5) });
    expect(r2.errors).toEqual([]);
    expect(summary(sender.calls.slice(5))).toEqual(FIRST_RUN.slice(0, 3));
    expect(await push('ev-done-trash')).toBe('sent');
    expect(await push('ev-done-milk')).toBe('sent');
    expect(await push('ev-jar')).toBe('sent');
    expect(await sentKeys()).toEqual(FIRST_RUN_KEYS);

    // and then nothing more
    await run({ db, sender, now: later(10) });
    expect(sender.calls).toHaveLength(8);
  });

  it('when every token of a member is dead: devices deleted, later pushes claim no keys', async () => {
    await seedDemo(db, NOW);
    const sender = new FakeSender();
    sender.invalid.add(tok.michalOld.token);
    sender.invalid.add(tok.michalPhone.token);

    const r1 = await run({ db, sender, now: NOW });
    expect(r1.errors).toEqual([]);
    const michal = r1.households[0]?.outcomes.filter((o) => o.send.uid === DEMO.michal);
    expect(michal?.map((o) => [o.send.type, o.status, o.newKeys.length])).toEqual([
      ['requested', 'undeliverable', 1], // tried both tokens, both dead
      ['due', 'undeliverable', 0] // no devices left: nothing claimed
    ]);
    expect(sender.calls).toHaveLength(4); // 3 for Dani + 1 attempt for Michal
    expect(await exists(`users/${DEMO.michal}/devices/${tok.michalOld.deviceId}`)).toBe(false);
    expect(await exists(`users/${DEMO.michal}/devices/${tok.michalPhone.deviceId}`)).toBe(false);
    expect((await sentKeys()).filter((k) => k.endsWith(DEMO.michal))).toEqual([
      'ev:ev-req:u-michal'
    ]);
  });

  it('treats a thrown send as transient but reports the run as failed', async () => {
    await seedDemo(db, NOW);
    const sender = new FakeSender();
    sender.throws = true;
    const r1 = await run({ db, sender, now: NOW });
    expect(r1.errors.length).toBe(5);
    expect(r1.errors[0]).toContain('FCM unreachable');
    expect(r1.households[0]?.outcomes.every((o) => o.status === 'retry')).toBe(true);
    expect(await sentKeys()).toEqual([]);
    expect(await push('ev-req')).toBe('pending');

    sender.throws = false;
    const r2 = await run({ db, sender, now: later(5) });
    expect(r2.errors).toEqual([]);
    expect(summary(sender.calls.slice(5)).map((c) => c.title)).toEqual(
      FIRST_RUN.map((c) => c.title)
    );
  });

  it('prunes expired sent docs once a day, on the first run after 03:00', async () => {
    const mon0310 = new Date('2026-10-05T03:10:00+03:00');
    await seedDemo(db, mon0310);
    const put = (key: string, expireAt: number) =>
      db.doc(`households/${HID}/sent/${key}`).set({
        at: Timestamp.fromMillis(expireAt - SENT_TTL_DAYS * DAY),
        expireAt: Timestamp.fromMillis(expireAt)
      });
    await put('old-1', mon0310.getTime() - DAY);
    await put('old-2', mon0310.getTime() - MIN);
    await put('fresh', mon0310.getTime() + 10 * DAY);

    // 02:59 is before the prune window
    const early = await run({
      db,
      sender: new FakeSender(),
      now: new Date('2026-10-05T02:59:00+03:00')
    });
    expect(early.households[0]?.pruned).toBe(0);
    expect(await sentKeys()).toEqual(['fresh', 'old-1', 'old-2']);

    const r1 = await run({ db, sender: new FakeSender(), now: mon0310 });
    expect(r1.households[0]?.skipped).toMatch(/quiet hours/); // events wait for 07:30
    expect(r1.households[0]?.pruned).toBe(2);
    expect(await sentKeys()).toEqual(['fresh', 'prune:2026-10-05']);

    // later the same morning: already pruned today, even if something expired since
    await put('old-3', mon0310.getTime() + MIN);
    const r2 = await run({
      db,
      sender: new FakeSender(),
      now: new Date('2026-10-05T03:20:00+03:00')
    });
    expect(r2.households[0]?.pruned).toBe(0);
    expect(await sentKeys()).toEqual(['fresh', 'old-3', 'prune:2026-10-05']);

    // next day's first run after 03:00 prunes again
    const r3 = await run({
      db,
      sender: new FakeSender(),
      now: new Date('2026-10-06T03:00:00+03:00')
    });
    expect(r3.households[0]?.pruned).toBe(1);
    expect(await sentKeys()).toEqual(['fresh', 'prune:2026-10-05', 'prune:2026-10-06']);
  });

  it('--dry plans without writing or sending', async () => {
    await seedDemo(db, NOW);
    const lines: string[] = [];
    const r = await run({ db, now: NOW, dry: true, log: (l) => lines.push(l) });
    expect(r.errors).toEqual([]);
    expect(r.households[0]?.plan?.sends.map((s) => s.title)).toEqual(FIRST_RUN.map((c) => c.title));
    expect(r.households[0]?.outcomes).toEqual([]);
    expect(await sentKeys()).toEqual([]);
    expect(await push('ev-req')).toBe('pending');
    expect(await exists(`users/${tok.michalOld.uid}/devices/${tok.michalOld.deviceId}`)).toBe(true);
    expect(lines.join('\n')).toContain('→ מיכל [requested] דני ביקש ממך משימה');
  });

  it('a real run logs counts only (public Actions log)', async () => {
    await seedDemo(db, NOW);
    const lines: string[] = [];
    await run({ db, sender: new FakeSender(), now: NOW, log: (l) => lines.push(l) });
    const out = lines.join('\n');
    expect(out).toContain('delivered 5');
    expect(out).not.toMatch(/[֐-׿]/); // no Hebrew: no names, no titles
    expect(out).not.toContain('tok-');
    expect(out).not.toContain(HID);
  });
});
