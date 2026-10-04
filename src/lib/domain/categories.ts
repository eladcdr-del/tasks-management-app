// Default categories (Blueprint §3 table) with the keyword lists from Blueprint §6.
// The keywords are the raw words; the quick-add parser (1.3) owns the matching rules and the
// precedence between categories ("first match wins" in the order returns, car, health, finance,
// home, shopping, family). DEFAULT_CATEGORIES is in DISPLAY order, which is a different order.

import type { Category, CategoryId } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'car',
    label: 'רכב',
    short: 'רכב',
    icon: 'car',
    keywords: ['רכב', 'מוסך', 'טסט', 'צמיג', 'צמיגים', 'מצבר', 'שמן', "פנצ'ר", 'ביטוח רכב']
  },
  {
    id: 'shopping',
    label: 'קניות',
    short: 'קניות',
    icon: 'shopping-bag',
    keywords: ['לקנות', 'לרכוש', 'להזמין', 'סופר', 'קניות']
  },
  {
    id: 'home',
    label: 'בית ותיקונים',
    short: 'בית',
    icon: 'wrench',
    keywords: [
      'לתקן',
      'תיקון',
      'נזילה',
      'אינסטלטור',
      'חשמלאי',
      'מזגן',
      'נורה',
      'דוד',
      'צבע',
      'הדברה'
    ]
  },
  {
    id: 'health',
    label: 'בריאות',
    short: 'בריאות',
    icon: 'heart-pulse',
    keywords: ['רופא', 'רופאת', 'תור', 'בדיקה', 'מרפאה', 'שיניים', 'תרופה', 'מרשם', 'קופת חולים']
  },
  {
    id: 'finance',
    label: 'כספים וניירת',
    short: 'כספים',
    icon: 'receipt',
    keywords: [
      'ארנונה',
      'חשבון',
      'חשבונית',
      'בנק',
      'מס',
      'ביטוח',
      'טופס',
      'לשלם',
      'תשלום',
      'ביטוח לאומי',
      'משכנתא'
    ]
  },
  {
    id: 'returns',
    label: 'החזרות והחלפות',
    short: 'החזרות',
    icon: 'repeat-2',
    keywords: ['להחזיר', 'להחליף', 'החזרה', 'החלפה', 'זיכוי']
  },
  {
    id: 'family',
    label: 'משפחה ואירועים',
    short: 'משפחה',
    icon: 'gift',
    keywords: ['יום הולדת', 'מתנה', 'אירוע', 'חתונה', 'ברית']
  },
  { id: 'other', label: 'אחר', short: 'אחר', icon: 'circle-dot', keywords: [] }
];

/** Category ids in display order ("other" last). */
export const CATEGORY_ORDER: CategoryId[] = DEFAULT_CATEGORIES.map((c) => c.id);

const byId = new Map<string, Category>(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
const OTHER = byId.get('other') as Category;

/**
 * Looks a category up. `null`/`undefined` ("no category chosen") gives `null`; an id that is not in
 * the table (stale or hand-edited data) falls back to "other" so the UI always has a label and icon.
 */
export function getCategory(id: CategoryId): Category;
export function getCategory(id: CategoryId | null | undefined): Category | null;
export function getCategory(id: CategoryId | null | undefined): Category | null {
  if (id == null) return null;
  return byId.get(id) ?? OTHER;
}

/** The full category label ("בית ותיקונים"); '' for no category, "אחר" for an unknown id. */
export function categoryLabel(id: CategoryId | null | undefined): string {
  return getCategory(id)?.label ?? '';
}

/** The compact label for card meta rows ("בית"); '' for no category, "אחר" for an unknown id. */
export function categoryShort(id: CategoryId | null | undefined): string {
  return getCategory(id)?.short ?? '';
}
