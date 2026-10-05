// owner: step 2.3 — shared fixtures for the Firestore rules suite (tests/rules/*.test.ts).
//
// Every factory returns a VALID document in its stored shape (docs/firestore-schema.md); tests make
// it invalid with `overrides`. "Now" timestamps use serverTimestamp(), exactly like the adapter, so
// the same factories work for client writes (rules on) and for seeding (rules off).

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  type Firestore,
  type WriteBatch
} from 'firebase/firestore';

export type Doc = Record<string, unknown>;

export const PROJECT_ID = 'demo-homecare';

/** Household ids look like Firestore auto ids (20 base62 chars). */
export const HID = 'hhAlpha0000000000001';
export const OTHER_HID = 'hhBravo0000000000002';

/** Founder / owner of HID. */
export const ALICE = 'alice-uid';
/** Second member of HID (joined with CODE). */
export const BOB = 'bob-uid';
/** Attacker: a valid signed-in Google account that is not a member of anything. */
export const EVE = 'eve-uid';
/** Owner of OTHER_HID. */
export const OLGA = 'olga-uid';

/** Active invite of HID / OTHER_HID (24 base62 chars). */
export const CODE = 'InviteCodeAlpha000000001';
export const OTHER_CODE = 'InviteCodeBravo000000002';
export const SPARE_CODE = 'InviteCodeSpare000000003';

const DAY_MS = 86_400_000;

/** A Timestamp `n` days from now (negative = past). */
export function inDays(n: number): Timestamp {
  return Timestamp.fromMillis(Date.now() + n * DAY_MS);
}

// ───────────────────────────── environment ─────────────────────────────

export async function makeEnv(): Promise<RulesTestEnvironment> {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8080 }
  });
}

/**
 * Registers the per-file lifecycle: one test environment per file, a clean database before every
 * test. Returns a getter for the environment.
 */
export function useRulesEnv(): () => RulesTestEnvironment {
  let env: RulesTestEnvironment | undefined;
  beforeAll(async () => {
    env = await makeEnv();
  });
  afterAll(async () => {
    await env?.cleanup();
  });
  beforeEach(async () => {
    await env?.clearFirestore();
  });
  return () => {
    if (!env) throw new Error('rules test environment is not initialised');
    return env;
  };
}

/** A client Firestore acting as `uid` (null = signed out). Modular API on the compat instance. */
export function as(env: RulesTestEnvironment, uid: string | null): Firestore {
  const ctx = uid === null ? env.unauthenticatedContext() : env.authenticatedContext(uid);
  return ctx.firestore() as unknown as Firestore;
}

/** Writes with security rules disabled (plays the role of existing data / the Admin SDK). */
export async function seed(
  env: RulesTestEnvironment,
  fn: (db: Firestore) => Promise<unknown>
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

// ───────────────────────────── paths ─────────────────────────────

export const path = {
  household: (hid = HID) => `households/${hid}`,
  member: (uid: string, hid = HID) => `households/${hid}/members/${uid}`,
  members: (hid = HID) => `households/${hid}/members`,
  task: (id: string, hid = HID) => `households/${hid}/tasks/${id}`,
  tasks: (hid = HID) => `households/${hid}/tasks`,
  event: (id: string, hid = HID) => `households/${hid}/events/${id}`,
  events: (hid = HID) => `households/${hid}/events`,
  photo: (id: string, hid = HID) => `households/${hid}/photos/${id}`,
  photos: (hid = HID) => `households/${hid}/photos`,
  treat: (round: number | string, hid = HID) => `households/${hid}/treats/${round}`,
  treats: (hid = HID) => `households/${hid}/treats`,
  sent: (key: string, hid = HID) => `households/${hid}/sent/${key}`,
  invite: (code: string) => `invites/${code}`,
  user: (uid: string) => `users/${uid}`,
  device: (uid: string, deviceId: string) => `users/${uid}/devices/${deviceId}`
};

// ───────────────────────────── document factories ─────────────────────────────

export function notifyPrefs(overrides: Doc = {}): Doc {
  return { requests: true, reminders: true, partnerDone: true, weekly: true, ...overrides };
}

/** households/{hid}/members/{uid}. Founder: role 'owner', inviteCode null. Joiner: 'member' + code. */
export function memberDoc(
  role: 'owner' | 'member' = 'member',
  inviteCode: string | null = role === 'member' ? CODE : null,
  overrides: Doc = {}
): Doc {
  return {
    displayName: role === 'owner' ? 'מיכל' : 'דני',
    photoURL: 'https://lh3.googleusercontent.com/a/photo-123',
    color: role === 'owner' ? 'terracotta' : 'slate',
    addressAs: role === 'owner' ? 'f' : 'm',
    role,
    joinedAt: serverTimestamp(),
    notify: notifyPrefs(),
    inviteCode,
    ...overrides
  };
}

export function jarDoc(overrides: Doc = {}): Doc {
  return {
    treat: 'ארוחה במסעדה',
    target: 10,
    count: 0,
    round: 1,
    startedAt: serverTimestamp(),
    ...overrides
  };
}

/** households/{hid} as the founder creates it. */
export function householdDoc(founder: string, overrides: Doc = {}): Doc {
  return {
    name: 'הבית שלנו',
    memberIds: [founder],
    memberCount: 1,
    maxMembers: 6,
    createdBy: founder,
    createdAt: serverTimestamp(),
    jar: null,
    invite: null,
    ...overrides
  };
}

/** invites/{code}. */
export function inviteDoc(hid: string, createdBy: string, overrides: Doc = {}): Doc {
  return {
    householdId: hid,
    householdName: 'הבית שלנו',
    inviterName: 'מיכל',
    memberCount: 2,
    createdBy,
    createdAt: serverTimestamp(),
    expiresAt: inDays(6),
    revoked: false,
    ...overrides
  };
}

export function completionDoc(overrides: Doc = {}): Doc {
  return {
    note: 'מוסך השרון, כפר סבא',
    cost: 650,
    place: 'מוסך השרון',
    contact: 'יוסי 050-0000000',
    photoIds: [],
    ...overrides
  };
}

/** households/{hid}/tasks/{id}: an open task created by `uid` (Task minus id and pending). */
export function taskDoc(uid: string, overrides: Doc = {}): Doc {
  return {
    title: 'להחליף מצבר',
    notes: '',
    categoryId: 'car',
    priority: 'normal',
    ownerId: null,
    requestedBy: null,
    requestedAt: null,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
    scheduledFor: null,
    weekPlan: false,
    dueDate: null,
    dueTime: null,
    hardDeadline: false,
    recurrence: null,
    seriesId: null,
    status: 'open',
    snoozeCount: 0,
    lastSnoozedAt: null,
    completedAt: null,
    completedBy: null,
    completion: null,
    ...overrides
  };
}

/** A copy of `d` without `keys` (for "missing field" cases). */
export function omit(d: Doc, ...keys: string[]): Doc {
  const copy = { ...d };
  for (const k of keys) delete copy[k];
  return copy;
}

/** Fields an update by `uid` must always carry. */
export function touched(uid: string): Doc {
  return { updatedBy: uid, updatedAt: serverTimestamp() };
}

const PUSH_TYPES = new Set(['requested', 'accepted', 'declined', 'completed', 'jar_filled']);

/** households/{hid}/events/{id}; `push` follows the type unless overridden. */
export function eventDoc(uid: string, type = 'created', overrides: Doc = {}): Doc {
  return {
    type,
    actorId: uid,
    taskId: 'task-1',
    taskTitle: 'להחליף מצבר',
    targetId: null,
    createdAt: serverTimestamp(),
    push: PUSH_TYPES.has(type) ? 'pending' : 'none',
    ...overrides
  };
}

export const JPEG_PREFIX = 'data:image/jpeg;base64,';

/** A data URL of exactly `size` characters. */
export function jpegDataUrl(size: number): string {
  return JPEG_PREFIX + 'A'.repeat(Math.max(0, size - JPEG_PREFIX.length));
}

/** households/{hid}/photos/{id}. */
export function photoDoc(uid: string, taskId = 'task-1', overrides: Doc = {}): Doc {
  return {
    taskId,
    dataUrl: jpegDataUrl(200_000),
    thumbDataUrl: jpegDataUrl(15_000),
    width: 1600,
    height: 1200,
    createdBy: uid,
    createdAt: serverTimestamp(),
    ...overrides
  };
}

/** households/{hid}/treats/{round}, as the redeem batch writes it for jarDoc(). */
export function treatDoc(overrides: Doc = {}): Doc {
  return {
    treat: 'ארוחה במסעדה',
    target: 10,
    filledAt: serverTimestamp(),
    redeemedAt: serverTimestamp(),
    ...overrides
  };
}

/** users/{uid}. */
export function userDoc(householdId: string | null, overrides: Doc = {}): Doc {
  return { householdId, createdAt: serverTimestamp(), ...overrides };
}

/** users/{uid}/devices/{deviceId}. */
export function deviceDoc(householdId: string, overrides: Doc = {}): Doc {
  return {
    householdId,
    token: 'fcm-token-' + 'x'.repeat(150),
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides
  };
}

// ───────────────────────────── seeding ─────────────────────────────

export interface SeedHouseholdOptions {
  hid?: string;
  /** First uid is the founder/owner; the rest joined with `code`. */
  members?: string[];
  jar?: Doc | null;
  /** The household's active invite (household.invite + invites/{code}); null = none. */
  code?: string | null;
  inviteOverrides?: Doc;
}

/**
 * Seeds a household with its members docs and (by default) an active invite. Defaults: HID with
 * ALICE (owner) and BOB (member), jar "ארוחה במסעדה" at 7/10 in round 1, active invite CODE.
 */
export async function seedHousehold(
  env: RulesTestEnvironment,
  opts: SeedHouseholdOptions = {}
): Promise<void> {
  const {
    hid = HID,
    members = [ALICE, BOB],
    jar = jarDoc({ count: 7 }),
    code = CODE,
    inviteOverrides = {}
  } = opts;
  const owner = members[0];
  if (owner === undefined) throw new Error('seedHousehold: needs at least one member');
  const expiresAt = (inviteOverrides.expiresAt as Timestamp | undefined) ?? inDays(6);
  await seed(env, async (db) => {
    const b = writeBatch(db);
    b.set(
      doc(db, path.household(hid)),
      householdDoc(owner, {
        memberIds: members,
        memberCount: members.length,
        jar,
        invite: code === null ? null : { code, expiresAt }
      })
    );
    members.forEach((uid, i) => {
      b.set(
        doc(db, path.member(uid, hid)),
        i === 0 ? memberDoc('owner') : memberDoc('member', code ?? CODE, { color: 'sage' })
      );
    });
    if (code !== null) {
      b.set(
        doc(db, path.invite(code)),
        inviteDoc(hid, owner, { memberCount: members.length, expiresAt, ...inviteOverrides })
      );
    }
    await b.commit();
  });
}

/** The standard fixture: HID with ALICE (owner) + BOB, plus OTHER_HID owned by OLGA. */
export async function seedTwoMemberHousehold(
  env: RulesTestEnvironment,
  opts: SeedHouseholdOptions = {}
): Promise<void> {
  await seedHousehold(env, opts);
  await seedHousehold(env, { hid: OTHER_HID, members: [OLGA], code: OTHER_CODE });
}

/** Seeds a stored task (rules off). */
export async function seedTask(
  env: RulesTestEnvironment,
  id: string,
  overrides: Doc = {},
  hid = HID
): Promise<void> {
  await seed(env, (db) => setDoc(doc(db, path.task(id, hid)), taskDoc(ALICE, overrides)));
}

// ───────────────────────────── canonical multi-document writes ─────────────────────────────

export interface JoinOptions {
  hid?: string;
  code?: string;
  member?: Doc;
  /** Replace the household update payload (default: arrayUnion(uid) + increment(1)). */
  householdPatch?: Doc;
  skipHousehold?: boolean;
  skipMember?: boolean;
  /** Also write users/{uid} and a member_joined event (the full adapter batch). */
  full?: boolean;
}

/** The join batch: household.memberIds += self, members/{self} with the invite code. */
export function joinBatch(db: Firestore, uid: string, opts: JoinOptions = {}): WriteBatch {
  const hid = opts.hid ?? HID;
  const code = opts.code ?? CODE;
  const b = writeBatch(db);
  if (!opts.skipHousehold) {
    b.update(
      doc(db, path.household(hid)),
      opts.householdPatch ?? { memberIds: arrayUnion(uid), memberCount: increment(1) }
    );
  }
  if (!opts.skipMember) {
    b.set(doc(db, path.member(uid, hid)), opts.member ?? memberDoc('member', code));
  }
  if (opts.full) {
    b.set(doc(db, path.user(uid)), userDoc(hid));
    b.set(
      doc(db, path.event(`joined-${uid}`, hid)),
      eventDoc(uid, 'member_joined', { taskId: null, taskTitle: null })
    );
  }
  return b;
}

/**
 * The leave batch: members/{self} deleted, household.memberIds -= self, users/{self} cleared, and
 * every task in `releaseTaskIds` (the leaver's open tasks) released: owner and request cleared.
 * No events: the events rule needs the caller to still be a member after the batch.
 */
export function leaveBatch(
  db: Firestore,
  uid: string,
  hid = HID,
  releaseTaskIds: readonly string[] = []
): WriteBatch {
  const b = writeBatch(db);
  b.delete(doc(db, path.member(uid, hid)));
  b.update(doc(db, path.household(hid)), {
    memberIds: arrayRemove(uid),
    memberCount: increment(-1)
  });
  b.set(doc(db, path.user(uid)), userDoc(null));
  for (const id of releaseTaskIds) {
    b.update(doc(db, path.task(id, hid)), {
      ownerId: null,
      requestedBy: null,
      requestedAt: null,
      ...touched(uid)
    });
  }
  return b;
}

/** The founder batch: households/{hid} + members/{self} (owner) + users/{self}. */
export function founderBatch(
  db: Firestore,
  uid: string,
  hid: string,
  opts: { household?: Doc; member?: Doc | null; user?: boolean } = {}
): WriteBatch {
  const b = writeBatch(db);
  b.set(doc(db, path.household(hid)), opts.household ?? householdDoc(uid));
  if (opts.member !== null) {
    b.set(doc(db, path.member(uid, hid)), opts.member ?? memberDoc('owner'));
  }
  if (opts.user) b.set(doc(db, path.user(uid)), userDoc(hid));
  return b;
}
