// Fixture data for the dev gallery (like seed data: content, not UI strings).
import type { CategoryId, ISODate, MemberColor, Priority, RecurrenceFreq } from '$lib/domain/types';
import { ageDays } from '$lib/domain/age';
import { getCategory } from '$lib/domain/categories';
import { addDays } from '$lib/domain/dates';
import { ageLabel, snoozedLabel, whenChip } from '$lib/i18n/format';
import { recurrenceLabel } from '$lib/parser/labels';
import type { AvatarPerson } from '$components/ui/types';

/** A stand-in "Google photo" (inline SVG, no network). */
export const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9b48f"/><stop offset="1" stop-color="#9c7a62"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/><path d="M12 80c2-17 13-26 28-26s26 9 28 26z" fill="#5f7f8f"/><circle cx="40" cy="34" r="14" fill="#f1d7c3"/><path d="M25 33c-1-12 6-19 15-19s16 7 15 19c-3-6-8-9-15-9s-12 3-15 9z" fill="#4b3326"/></svg>`
  );

export const MEMBER_COLORS: MemberColor[] = [
  'terracotta',
  'sage',
  'slate',
  'plum',
  'ochre',
  'teal'
];

export const COLOR_NAMES: Record<MemberColor, string> = {
  terracotta: 'טרקוטה',
  sage: 'מרווה',
  slate: 'כחול־אפור',
  plum: 'שזיף',
  ochre: 'חרדל',
  teal: 'טורקיז'
};

export const michal: AvatarPerson = { displayName: 'מיכל', photoURL: null, color: 'terracotta' };
export const danny: AvatarPerson = { displayName: 'דני', photoURL: null, color: 'slate' };

export const family: AvatarPerson[] = [
  { displayName: 'מיכל', color: 'terracotta' },
  { displayName: 'דני', color: 'slate' },
  { displayName: 'נועה', color: 'sage', photoURL: PHOTO },
  { displayName: 'יואב', color: 'ochre' },
  { displayName: 'תמר', color: 'plum' },
  { displayName: 'Omer', color: 'teal' }
];

export interface MockBadge {
  kind: 'overdue' | 'urgent' | 'due' | 'deadline' | 'age' | 'snooze';
  label: string;
  /** 'plain' = quiet inline meta (no pill). */
  variant?: 'plain';
}

export interface MockTask {
  id: string;
  title: string;
  category: CategoryId;
  /** getCategory(category).short */
  categoryLabel: string;
  owner: 'me' | 'partner' | null;
  badges: MockBadge[];
  recurring?: string;
  requested?: string;
  pending?: boolean;
  done?: boolean;
}

/** The gallery's fixed "today" (a Sunday), so the labels and screenshots never drift. */
export const GALLERY_TODAY: ISODate = '2026-10-04';
const NOW = Date.parse(`${GALLERY_TODAY}T09:00:00+03:00`);
const NOW_WALL = { hour: 9, minute: 0 };
const URGENT_LABEL = 'דחוף';

interface MockSpec {
  id: string;
  title: string;
  category: CategoryId;
  owner: 'me' | 'partner' | null;
  /** Offsets in days from GALLERY_TODAY. */
  due?: number;
  planned?: number;
  dueTime?: string;
  hardDeadline?: boolean;
  priority?: Priority;
  createdDaysAgo?: number;
  snoozeCount?: number;
  recurrence?: RecurrenceFreq;
  requested?: string;
  pending?: boolean;
  done?: boolean;
}

/** Builds a mock card the way TaskCard will: every label comes from the real formatters. */
function mock(spec: MockSpec): MockTask {
  const dueDate = spec.due === undefined ? null : addDays(GALLERY_TODAY, spec.due);
  const scheduledFor = spec.planned === undefined ? null : addDays(GALLERY_TODAY, spec.planned);
  const ageFields = {
    createdAt: NOW - (spec.createdDaysAgo ?? 0) * 86_400_000,
    seriesId: spec.recurrence ? `s-${spec.id}` : null,
    dueDate,
    scheduledFor
  };
  const badges: MockBadge[] = [];
  const when = whenChip(
    { dueDate, scheduledFor, dueTime: spec.dueTime ?? null },
    GALLERY_TODAY,
    NOW_WALL
  );
  if (when?.tone === 'late') badges.push({ kind: 'overdue', label: when.text });
  if (spec.priority === 'urgent') badges.push({ kind: 'urgent', label: URGENT_LABEL });
  if (when && when.tone !== 'late') {
    badges.push({ kind: spec.hardDeadline ? 'deadline' : 'due', label: when.text });
  }
  if (ageDays(ageFields, NOW) >= 14) badges.push({ kind: 'age', label: ageLabel(ageFields, NOW) });
  if (spec.snoozeCount) {
    badges.push({ kind: 'snooze', label: snoozedLabel(spec.snoozeCount), variant: 'plain' });
  }
  return {
    id: spec.id,
    title: spec.title,
    category: spec.category,
    categoryLabel: getCategory(spec.category).short,
    owner: spec.owner,
    badges,
    recurring: spec.recurrence
      ? recurrenceLabel(spec.recurrence, undefined, GALLERY_TODAY)
      : undefined,
    requested: spec.requested,
    pending: spec.pending,
    done: spec.done
  };
}

export const attention: MockTask[] = [
  mock({ id: 'a1', title: 'לקחת את האוטו לטסט', category: 'car', owner: 'partner', due: -2 }),
  mock({
    id: 'a2',
    title: 'לשלם ארנונה',
    category: 'finance',
    owner: 'me',
    recurrence: 'monthly',
    priority: 'urgent',
    due: 0,
    hardDeadline: true
  })
];

export const waiting: MockTask = mock({
  id: 'w1',
  title: 'להזמין אינסטלטור לנזילה במקלחת',
  category: 'home',
  owner: null
});

export const today: MockTask[] = [
  mock({
    id: 't1',
    title: 'להחליף את החולצה בקניון',
    category: 'returns',
    owner: 'me',
    due: 3,
    hardDeadline: true
  }),
  mock({
    id: 't2',
    title: 'לברר על מזגן חדש לחדר השינה',
    category: 'home',
    owner: 'partner',
    createdDaysAgo: 49,
    snoozeCount: 4
  }),
  mock({
    id: 't3',
    title: 'Netflix: לבטל את המנוי לפני החידוש',
    category: 'finance',
    owner: 'me',
    requested: 'דני ביקש ממך',
    pending: true,
    due: 27
  }),
  mock({
    id: 't4',
    title: 'לקנות מתנה ליום ההולדת של נועה',
    category: 'family',
    owner: 'me',
    planned: 0,
    dueTime: '17:30'
  })
];
