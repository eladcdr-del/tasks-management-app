// The thin I/O shell around the pure planner (Blueprint §9 "Per run"). For each household:
//   load → plan → for each Send: create sent/{key} (ALREADY_EXISTS = skip) → push → clean up dead
//   tokens / roll back keys on transient failure → mark events → (daily) prune expired sent docs.
//
// Delivery guarantee: AT MOST ONCE per key. A key is created BEFORE the push, so a crash between
// the two loses that push rather than doubling it. A transient failure where no device got the
// push deletes the keys this run created and leaves the events pending, so the next run retries.
// A push that reached at least one device is never retried (a retry would double it there).
//
// Multi-key Sends (coalesced summaries): every key is created; the push goes out once if at least
// one key was new. Only the keys THIS run created are rolled back on a transient failure.
//
// Logs are PUBLIC (Actions logs of a public repo): a real run prints counts only, never names,
// titles or tokens. `--dry` (local use) prints the full plan.

import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { activeWindows, anyReminderWindow, plan, type Plan, type Send } from './planner.ts';
import { inWindow, localParts, type LocalParts } from './time.ts';
import type { Sender } from './sender.ts';
import type { DeviceToken, Household, Member } from './types.ts';
import {
  listHouseholds,
  loadDevices,
  loadMembers,
  loadOpenTasks,
  loadPendingEvents
} from './load.ts';

export const SENT_TTL_DAYS = 45;
const DAY_MS = 86_400_000;
/** The daily prune happens on the first run at or after 03:00 local (inside 03:00-06:00). */
export const PRUNE_WINDOW = ['03:00', '06:00'] as const;
const BATCH_LIMIT = 400;

export type SendStatus =
  /** Pushed to at least one device. */
  | 'delivered'
  /** Every key already existed: an earlier run sent it. */
  | 'duplicate'
  /** Transient failure, nothing delivered: keys rolled back, retried next run. */
  | 'retry'
  /** Every token was dead (devices deleted); keys kept, nothing to retry. */
  | 'undeliverable';

export interface SendOutcome {
  send: Send;
  status: SendStatus;
  /** Keys this run created (and still holds, unless status is 'retry'). */
  newKeys: string[];
  tokens: number;
  invalidTokens: number;
  errorCodes: string[];
}

export interface HouseholdReport {
  householdId: string;
  /** Why nothing was planned, when nothing was. */
  skipped?: string;
  plan?: Plan;
  members?: Member[];
  outcomes: SendOutcome[];
  eventsMarked: number;
  eventsLeftPending: number;
  devicesRemoved: number;
  pruned: number;
}

export interface RunReport {
  now: string;
  local: LocalParts;
  dry: boolean;
  households: HouseholdReport[];
  errors: string[];
}

export interface RunOptions {
  db: Firestore;
  /** Required unless `dry`. */
  sender?: Sender;
  /** Injected clock (tests, `--now`). Defaults to the real time. */
  now?: Date;
  /** Plan only: no writes, no pushes. */
  dry?: boolean;
  log?: (line: string) => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** gRPC ALREADY_EXISTS (6) is what create() throws when the doc is there. */
export function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (!e) return false;
  return (
    e.code === 6 ||
    e.code === 'already-exists' ||
    e.code === 'ALREADY_EXISTS' ||
    (typeof e.message === 'string' && /ALREADY_EXISTS/.test(e.message))
  );
}

const sentRef = (db: Firestore, hid: string, key: string) =>
  db.doc(`households/${hid}/sent/${key}`);

/** Creates sent/{key}. true = created now, false = it already existed. */
export async function claimKey(
  db: Firestore,
  hid: string,
  key: string,
  now: Date,
  ttlDays = SENT_TTL_DAYS
): Promise<boolean> {
  try {
    await sentRef(db, hid, key).create({
      at: Timestamp.fromDate(now),
      expireAt: Timestamp.fromMillis(now.getTime() + ttlDays * DAY_MS)
    });
    return true;
  } catch (err) {
    if (isAlreadyExists(err)) return false;
    throw err;
  }
}

async function releaseKeys(db: Firestore, hid: string, keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => sentRef(db, hid, k).delete()));
}

/** Deletes every `sent` doc whose expireAt is in the past. Returns how many were deleted. */
export async function pruneExpired(db: Firestore, hid: string, now: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const snap = await db
      .collection(`households/${hid}/sent`)
      .where('expireAt', '<', Timestamp.fromDate(now))
      .limit(BATCH_LIMIT)
      .get();
    if (snap.empty) return total;
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    total += snap.size;
    if (snap.size < BATCH_LIMIT) return total;
  }
}

async function deliver(
  db: Firestore,
  hid: string,
  send: Send,
  devicesByUid: Record<string, DeviceToken[]>,
  sender: Sender,
  now: Date,
  errors: string[]
): Promise<{ outcome: SendOutcome; devicesRemoved: number }> {
  const devices = devicesByUid[send.uid] ?? [];
  const tokens = [...new Set(devices.map((d) => d.token).filter(Boolean))];
  const base = { send, tokens: tokens.length, invalidTokens: 0, errorCodes: [] as string[] };
  // Every device of this member died earlier in this run: claim nothing, so a phone registered
  // later today still gets the push.
  if (tokens.length === 0) {
    return { outcome: { ...base, status: 'undeliverable', newKeys: [] }, devicesRemoved: 0 };
  }

  const newKeys: string[] = [];
  try {
    for (const key of send.keys) if (await claimKey(db, hid, key, now)) newKeys.push(key);
  } catch (err) {
    await releaseKeys(db, hid, newKeys).catch(() => undefined);
    throw err;
  }
  if (newKeys.length === 0)
    return { outcome: { ...base, status: 'duplicate', newKeys }, devicesRemoved: 0 };

  let invalidTokens: string[] = [];
  let transient = 0;
  let errorCodes: string[] = [];
  try {
    const res = await sender.send(tokens, {
      type: send.type,
      title: send.title,
      body: send.body,
      url: send.url,
      tag: send.tag
    });
    invalidTokens = [...new Set(res.invalidTokens)].filter((t) => tokens.includes(t));
    transient = Math.max(0, res.transientFailures);
    errorCodes = res.errorCodes ?? [];
  } catch (err) {
    // The whole call failed (auth, network). Retry next run, and make the run visibly red.
    errors.push(`${hid}: push failed: ${errorMessage(err)}`);
    transient = tokens.length;
    errorCodes = ['send-threw'];
  }

  // Dead tokens: delete their device docs and forget them for the rest of this run.
  let devicesRemoved = 0;
  if (invalidTokens.length > 0) {
    const dead = devices.filter((d) => invalidTokens.includes(d.token));
    await Promise.all(dead.map((d) => db.doc(`users/${send.uid}/devices/${d.deviceId}`).delete()));
    devicesRemoved = dead.length;
    devicesByUid[send.uid] = devices.filter((d) => !invalidTokens.includes(d.token));
  }

  const delivered = tokens.length - invalidTokens.length - transient;
  const outcome = { ...base, invalidTokens: invalidTokens.length, errorCodes, newKeys };
  if (transient > 0 && delivered <= 0) {
    await releaseKeys(db, hid, newKeys);
    return { outcome: { ...outcome, status: 'retry' }, devicesRemoved };
  }
  return {
    outcome: { ...outcome, status: delivered > 0 ? 'delivered' : 'undeliverable' },
    devicesRemoved
  };
}

async function runHousehold(
  opts: Required<Pick<RunOptions, 'db' | 'dry'>> & { sender?: Sender },
  household: Household,
  now: Date,
  parts: LocalParts,
  errors: string[]
): Promise<HouseholdReport> {
  const { db, dry } = opts;
  const hid = household.id;
  const report: HouseholdReport = {
    householdId: hid,
    outcomes: [],
    eventsMarked: 0,
    eventsLeftPending: 0,
    devicesRemoved: 0,
    pruned: 0
  };
  const windows = activeWindows(parts);

  // Cheap first read: pending events. Members, devices and tasks are read only when something can
  // actually go out now: pending events outside quiet hours, or 08:00-22:00 for the reminders. At
  // 288 runs/day that is about 168 x (open tasks + 6) reads, well inside the Spark quota (50k/day).
  const events = await loadPendingEvents(db, hid);
  const eventsActionable = windows.events && events.length > 0;
  if (!eventsActionable && !anyReminderWindow(windows)) {
    report.skipped =
      events.length > 0
        ? `quiet hours: ${events.length} event(s) wait for 07:30`
        : 'nothing due now';
  } else {
    const members = await loadMembers(db, hid);
    const [devicesByUid, tasks] = await Promise.all([
      loadDevices(
        db,
        hid,
        members.map((m) => m.uid)
      ),
      loadOpenTasks(db, hid)
    ]);
    const result = plan({ now, household, members, tasks, events, devicesByUid });
    report.plan = result;
    report.members = members;

    if (!dry) {
      const sender = opts.sender;
      if (!sender) throw new Error('run(): a Sender is required unless dry');
      for (const send of result.sends) {
        const { outcome, devicesRemoved } = await deliver(
          db,
          hid,
          send,
          devicesByUid,
          sender,
          now,
          errors
        );
        report.outcomes.push(outcome);
        report.devicesRemoved += devicesRemoved;
      }

      // An event whose push must be retried stays pending; everything else is settled.
      const retry = new Set(
        report.outcomes.filter((o) => o.status === 'retry').flatMap((o) => o.send.eventIds)
      );
      const marks = result.eventMarks.filter((m) => !(m.push === 'sent' && retry.has(m.eventId)));
      report.eventsLeftPending = result.eventMarks.length - marks.length;
      for (let i = 0; i < marks.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        for (const m of marks.slice(i, i + BATCH_LIMIT)) {
          batch.update(db.doc(`households/${hid}/events/${m.eventId}`), { push: m.push });
        }
        await batch.commit();
      }
      report.eventsMarked = marks.length;
    }
  }

  // Daily prune, once per household per local day: the marker key is itself a dedupe key.
  if (!dry && inWindow(parts, ...PRUNE_WINDOW)) {
    if (await claimKey(db, hid, `prune:${parts.iso}`, now, 7)) {
      report.pruned = await pruneExpired(db, hid, now);
    }
  }
  return report;
}

/** One notifier run over every household. Never throws for a single household's failure. */
export async function run(options: RunOptions): Promise<RunReport> {
  const now = options.now ?? new Date();
  const dry = options.dry ?? false;
  const log = options.log ?? (() => undefined);
  const parts = localParts(now);
  const errors: string[] = [];
  const households: HouseholdReport[] = [];

  const all = await listHouseholds(options.db);
  for (const household of all) {
    try {
      households.push(
        await runHousehold(
          { db: options.db, dry, ...(options.sender ? { sender: options.sender } : {}) },
          household,
          now,
          parts,
          errors
        )
      );
    } catch (err) {
      errors.push(`${household.id}: ${errorMessage(err)}`);
    }
  }

  const report: RunReport = { now: now.toISOString(), local: parts, dry, households, errors };
  for (const line of dry ? formatPlan(report) : formatSummary(report)) log(line);
  return report;
}

// ── Output ────────────────────────────────────────────────────────────────────────────────────────

const pad2 = (n: number): string => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localLabel(p: LocalParts): string {
  return `${p.iso} ${DAYS[p.weekday]} ${pad2(p.hour)}:${pad2(p.minute)} Asia/Jerusalem (${p.isoWeek})`;
}

/** Counts only: safe for the public Actions log. */
export function formatSummary(r: RunReport): string[] {
  const lines = [
    `notifier ${r.now} · ${localLabel(r.local)} · ${r.households.length} household(s)`
  ];
  r.households.forEach((h, i) => {
    if (h.skipped) {
      lines.push(`  #${i + 1}: ${h.skipped}${h.pruned ? ` · pruned ${h.pruned}` : ''}`);
      return;
    }
    const count = (s: SendStatus) => h.outcomes.filter((o) => o.status === s).length;
    const codes = [...new Set(h.outcomes.flatMap((o) => o.errorCodes))];
    lines.push(
      `  #${i + 1}: planned ${h.plan?.sends.length ?? 0} · delivered ${count('delivered')} · ` +
        `duplicate ${count('duplicate')} · retry ${count('retry')} · undeliverable ${count('undeliverable')} · ` +
        `events marked ${h.eventsMarked}, left pending ${h.eventsLeftPending} · ` +
        `dead devices removed ${h.devicesRemoved} · pruned ${h.pruned}` +
        (codes.length ? ` · fcm errors: ${codes.join(', ')}` : '')
    );
  });
  for (const e of r.errors) lines.push(`::error::${e}`);
  return lines;
}

/** The full plan, names and titles included: for `--dry` on a developer machine. */
export function formatPlan(r: RunReport): string[] {
  const lines = [`DRY RUN: nothing is written or sent`, `now: ${r.now} = ${localLabel(r.local)}`];
  const w = activeWindows(r.local);
  lines.push(
    `windows: events ${w.events ? 'open' : 'closed (quiet hours)'} · due-day ${w.due ? 'open' : 'closed'} · ` +
      `day-before ${w.eve ? 'open' : 'closed'} · weekly ${w.weekly ? 'open' : 'closed'}`
  );
  for (const h of r.households) {
    lines.push('', `household ${h.householdId}`);
    if (h.skipped || !h.plan) {
      lines.push(`  ${h.skipped ?? 'nothing planned'}`);
      continue;
    }
    const name = (uid: string) => h.members?.find((m) => m.uid === uid)?.displayName || uid;
    if (h.plan.sends.length === 0) lines.push('  no pushes');
    for (const s of h.plan.sends) {
      lines.push(`  → ${name(s.uid)} [${s.type}] ${s.title}`);
      if (s.body) lines.push(`      ${s.body}`);
      lines.push(`      ${s.url}  tag=${s.tag}`);
      lines.push(`      keys: ${s.keys.join(', ')}`);
    }
    for (const m of h.plan.eventMarks) lines.push(`  event ${m.eventId} → ${m.push}`);
  }
  for (const e of r.errors) lines.push(`ERROR ${e}`);
  return lines;
}
