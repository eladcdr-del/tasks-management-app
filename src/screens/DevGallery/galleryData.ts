// Fixture data for the dev gallery (like seed data: content, not UI strings).
import type { MemberColor } from '$lib/domain/types';
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
  kind: 'age' | 'snooze' | 'due' | 'deadline' | 'danger';
  label: string;
  tone?: 'accent';
  /** 'plain' = quiet inline meta (no pill). */
  variant?: 'plain';
}

export interface MockTask {
  id: string;
  title: string;
  category: 'car' | 'shopping' | 'home' | 'health' | 'finance' | 'returns' | 'family' | 'other';
  categoryLabel: string;
  owner: 'me' | 'partner' | null;
  badges: MockBadge[];
  recurring?: string;
  requested?: string;
  pending?: boolean;
  done?: boolean;
}

export const attention: MockTask[] = [
  {
    id: 'a1',
    title: 'לקחת את האוטו לטסט',
    category: 'car',
    categoryLabel: 'רכב',
    owner: 'partner',
    badges: [{ kind: 'danger', label: 'באיחור יומיים' }]
  },
  {
    id: 'a2',
    title: 'לשלם ארנונה',
    category: 'finance',
    categoryLabel: 'כספים',
    owner: 'me',
    recurring: 'חודשי',
    badges: [
      { kind: 'danger', label: 'דחוף' },
      { kind: 'due', label: 'עד היום', tone: 'accent' }
    ]
  }
];

export const waiting: MockTask = {
  id: 'w1',
  title: 'להזמין אינסטלטור לנזילה במקלחת',
  category: 'home',
  categoryLabel: 'בית ותיקונים',
  owner: null,
  badges: []
};

export const today: MockTask[] = [
  {
    id: 't1',
    title: 'להחליף את החולצה בקניון',
    category: 'returns',
    categoryLabel: 'החזרות',
    owner: 'me',
    badges: [{ kind: 'deadline', label: 'עד יום ד׳' }]
  },
  {
    id: 't2',
    title: 'לברר על מזגן חדש לחדר השינה',
    category: 'home',
    categoryLabel: 'בית',
    owner: 'partner',
    badges: [
      { kind: 'age', label: 'פתוחה 7 שבועות' },
      { kind: 'snooze', label: 'נדחתה 4 פעמים', variant: 'plain' }
    ]
  },
  {
    id: 't3',
    title: 'לבטל את המנוי ל־Netflix לפני החידוש',
    category: 'finance',
    categoryLabel: 'כספים',
    owner: 'me',
    requested: 'דני ביקש ממך',
    pending: true,
    badges: [{ kind: 'due', label: 'עד 31.10' }]
  },
  {
    id: 't4',
    title: 'לקנות מתנה ליום ההולדת של נועה',
    category: 'family',
    categoryLabel: 'משפחה',
    owner: 'me',
    badges: []
  }
];
