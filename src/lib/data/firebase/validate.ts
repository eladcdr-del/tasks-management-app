// Client-side mirror of the value checks in firestore.rules (owner step 2.2). Invalid input is
// rejected before anything is written (no optimistic flash of a doomed document), as
// RepoError('permission', 'invalid: …'): the code the server would return for the same write.
// The rules stay the authority; this only catches what the UI could plausibly send.

import { RepoError } from '../repository';
import { DEFAULT_CATEGORIES } from '../../domain/categories';
import { isValidISO } from '../../domain/dates';
import type {
  AddressAs,
  Completion,
  EncodedPhoto,
  MemberColor,
  NotifyPrefs,
  Task
} from '../../domain/types';
import { ERROR_DETAIL } from './errors';

const PRIORITIES: ReadonlySet<string> = new Set(['normal', 'high', 'urgent']);
const CATEGORY_IDS: ReadonlySet<string> = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
const FREQS: ReadonlySet<string> = new Set(['weekly', 'monthly', 'yearly']);
const COLORS: ReadonlySet<string> = new Set(['terracotta', 'sage', 'slate', 'plum', 'ochre', 'teal']);
const ADDRESS: ReadonlySet<string> = new Set(['f', 'm', 'n']);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHOTO_URL_RE = /^https:\/\/[a-z0-9.-]+[.]googleusercontent[.]com\/[^ ]*$/;
const JPEG_PREFIX = 'data:image/jpeg;base64,';

export function invalid(why: string): never {
  throw new RepoError('permission', `${ERROR_DETAIL.invalidPrefix} ${why}`);
}

const isLen = (v: unknown, min: number, max: number): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max;

export type TaskFields = Pick<
  Task,
  | 'title'
  | 'notes'
  | 'categoryId'
  | 'priority'
  | 'scheduledFor'
  | 'dueDate'
  | 'dueTime'
  | 'hardDeadline'
  | 'recurrence'
>;

export function assertValidTask(t: TaskFields): void {
  if (!isLen(t.title, 1, 200)) invalid('title must be 1-200 characters');
  if (!isLen(t.notes, 0, 4000)) invalid('notes are limited to 4000 characters');
  if (!PRIORITIES.has(t.priority)) invalid('unknown priority');
  if (t.categoryId !== null && !CATEGORY_IDS.has(t.categoryId)) invalid('unknown category');
  if (t.scheduledFor !== null && !isValidISO(t.scheduledFor)) invalid('scheduledFor is not a date');
  if (t.dueDate !== null && !isValidISO(t.dueDate)) invalid('dueDate is not a date');
  if (t.dueTime !== null && !(typeof t.dueTime === 'string' && TIME_RE.test(t.dueTime))) {
    invalid('dueTime must be HH:mm');
  }
  if (typeof t.hardDeadline !== 'boolean') invalid('hardDeadline must be a boolean');
  if (t.recurrence !== null) {
    if (typeof t.recurrence !== 'object' || !FREQS.has(t.recurrence.freq)) {
      invalid('unknown recurrence');
    }
    if (t.recurrence.anchor !== undefined && !isValidISO(t.recurrence.anchor)) {
      invalid('recurrence anchor is not a date');
    }
  }
}

export function assertValidCompletion(c: Completion): void {
  if (!isLen(c.note, 0, 2000)) invalid('note is limited to 2000 characters');
  if (!isLen(c.place, 0, 120)) invalid('place is limited to 120 characters');
  if (!isLen(c.contact, 0, 120)) invalid('contact is limited to 120 characters');
  if (c.cost !== null && !(c.cost >= 0 && c.cost <= 10_000_000)) invalid('cost out of range');
}

export function assertValidPhoto(p: EncodedPhoto): void {
  if (!isLen(p.dataUrl, 24, 300_000) || !p.dataUrl.startsWith(JPEG_PREFIX)) {
    invalid('photo must be a JPEG data URL of at most 300,000 characters');
  }
  if (!isLen(p.thumbDataUrl, 24, 20_000) || !p.thumbDataUrl.startsWith(JPEG_PREFIX)) {
    invalid('thumbnail must be a JPEG data URL of at most 20,000 characters');
  }
  for (const n of [p.width, p.height]) {
    if (!Number.isInteger(n) || n < 1 || n > 4096) invalid('photo size must be 1-4096 px');
  }
}

/** Household name: trimmed, 1..60. */
export function cleanHouseholdName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!isLen(n, 1, 60)) invalid('household name must be 1-60 characters');
  return n;
}

/** Member display name: trimmed, at most 40 (longer Google names are cut), never empty. */
export function cleanDisplayName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim().slice(0, 40).trim() : '';
  if (n.length < 1) invalid('display name is required');
  return n;
}

/** Only Google account photos are stored (rules: no tracking pixels); anything else → null. */
export function safePhotoURL(url: unknown): string | null {
  return typeof url === 'string' && url.length <= 2048 && PHOTO_URL_RE.test(url) ? url : null;
}

export function assertColor(c: unknown): asserts c is MemberColor {
  if (typeof c !== 'string' || !COLORS.has(c)) invalid('unknown color');
}

export function assertAddressAs(a: unknown): asserts a is AddressAs {
  if (typeof a !== 'string' || !ADDRESS.has(a)) invalid('unknown addressAs');
}

export function cleanNotify(n: NotifyPrefs): NotifyPrefs {
  const out = {
    requests: n?.requests,
    reminders: n?.reminders,
    partnerDone: n?.partnerDone,
    weekly: n?.weekly
  };
  if (Object.values(out).some((v) => typeof v !== 'boolean')) invalid('notify must be 4 booleans');
  return out as NotifyPrefs;
}

/** Jar settings: treat trimmed 1..60, target an integer 3..50. */
export function cleanJar(j: { treat: unknown; target: unknown }): { treat: string; target: number } {
  const treat = typeof j.treat === 'string' ? j.treat.trim() : '';
  if (!isLen(treat, 1, 60)) invalid('treat must be 1-60 characters');
  const target = j.target;
  if (typeof target !== 'number' || !Number.isInteger(target) || target < 3 || target > 50) {
    invalid('target must be a whole number from 3 to 50');
  }
  return { treat, target };
}
