import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER,
  categoryLabel,
  categoryShort,
  DEFAULT_CATEGORIES,
  getCategory
} from './categories';
import type { CategoryId } from './types';

describe('DEFAULT_CATEGORIES', () => {
  it('matches the Blueprint §3 table: ids, Hebrew labels, lucide icons', () => {
    expect(DEFAULT_CATEGORIES.map((c) => [c.id, c.label, c.icon])).toEqual([
      ['car', 'רכב', 'car'],
      ['shopping', 'קניות', 'shopping-bag'],
      ['home', 'בית ותיקונים', 'wrench'],
      ['health', 'בריאות', 'heart-pulse'],
      ['finance', 'כספים וניירת', 'receipt'],
      ['returns', 'החזרות והחלפות', 'repeat-2'],
      ['family', 'משפחה ואירועים', 'gift'],
      ['other', 'אחר', 'circle-dot']
    ]);
  });

  it('carries the Blueprint §6 keyword lists', () => {
    const kw = (id: CategoryId) => getCategory(id).keywords;
    expect(kw('returns')).toEqual(['להחזיר', 'להחליף', 'החזרה', 'החלפה', 'זיכוי']);
    expect(kw('car')).toEqual([
      'רכב',
      'מוסך',
      'טסט',
      'צמיג',
      'צמיגים',
      'מצבר',
      'שמן',
      "פנצ'ר",
      'ביטוח רכב'
    ]);
    expect(kw('health')).toEqual([
      'רופא',
      'רופאת',
      'תור',
      'בדיקה',
      'מרפאה',
      'שיניים',
      'תרופה',
      'מרשם',
      'קופת חולים'
    ]);
    expect(kw('finance')).toEqual([
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
    ]);
    expect(kw('home')).toEqual([
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
    ]);
    expect(kw('shopping')).toEqual(['לקנות', 'לרכוש', 'להזמין', 'סופר', 'קניות']);
    expect(kw('family')).toEqual(['יום הולדת', 'מתנה', 'אירוע', 'חתונה', 'ברית']);
  });

  it('has no keywords for the catch-all "other"', () => {
    expect(getCategory('other').keywords).toEqual([]);
  });

  it('has unique ids', () => {
    const ids = DEFAULT_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('CATEGORY_ORDER', () => {
  it('lists every category id once, in display order, "other" last', () => {
    expect(CATEGORY_ORDER).toEqual([
      'car',
      'shopping',
      'home',
      'health',
      'finance',
      'returns',
      'family',
      'other'
    ]);
    expect([...CATEGORY_ORDER].sort()).toEqual(DEFAULT_CATEGORIES.map((c) => c.id).sort());
  });
});

describe('getCategory', () => {
  it('looks a category up by id', () => {
    expect(getCategory('car')).toMatchObject({ id: 'car', label: 'רכב', icon: 'car' });
    expect(getCategory('returns').label).toBe('החזרות והחלפות');
  });

  it('returns null for "no category" (null / undefined)', () => {
    expect(getCategory(null)).toBeNull();
    expect(getCategory(undefined)).toBeNull();
  });

  it('falls back to "other" for an id it does not know (bad stored data)', () => {
    expect(getCategory('spaceship' as CategoryId).id).toBe('other');
  });
});

describe('categoryLabel / categoryShort', () => {
  it('give the full label and the compact card label (Phase 1 council: Category.short)', () => {
    expect(CATEGORY_ORDER.map((id) => categoryShort(id))).toEqual([
      'רכב',
      'קניות',
      'בית',
      'בריאות',
      'כספים',
      'החזרות',
      'משפחה',
      'אחר'
    ]);
    expect(categoryLabel('home')).toBe('בית ותיקונים');
    expect(categoryLabel('family')).toBe('משפחה ואירועים');
  });

  it('every short label fits a card meta row (at most 8 characters)', () => {
    for (const c of DEFAULT_CATEGORIES) expect(c.short.length).toBeLessThanOrEqual(8);
  });

  it('are empty for "no category" and fall back to "אחר" for an unknown id', () => {
    expect(categoryLabel(null)).toBe('');
    expect(categoryShort(undefined)).toBe('');
    expect(categoryLabel('spaceship' as CategoryId)).toBe('אחר');
    expect(categoryShort('spaceship' as CategoryId)).toBe('אחר');
  });
});
