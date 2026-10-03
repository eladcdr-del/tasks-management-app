// Hebrew lexicon for the quick-add parser (Blueprint §6): day names, month names, relative-date
// phrases, priority words, recurrence words and category keywords.
//
// This file is data plus two tiny helpers (`lit`, `alt`) that turn lexicon strings into regex source.
// All words are stored NFC, without niqqud. The parser matches against text that is normalised the
// same way (niqqud removed, maqaf and hyphens treated as spaces), so none of that is needed here.

import type { CategoryId, Priority, RecurrenceFreq } from '../domain/types';

// ───────────────────────────── prefixes and punctuation ─────────────────────────────

/** One-letter Hebrew prefixes a word may carry: ו ה ב ל מ ש כ (and, to, in, from, that, like). */
export const PREFIX_LETTERS = 'והבלמשכ';
/** At most two stacked prefixes, e.g. ו+ב in "וביום". */
export const MAX_PREFIXES = 2;
/** Priority words must NOT take ל: "לדחוף" means "to push" and "לחשוב" means "to think". */
export const PRIORITY_PREFIX_LETTERS = 'והבמשכ';

/** Regex class for a geresh: U+05F3, ASCII apostrophe, right single quote. */
export const GERESH_CLASS = "['\u{5F3}\u{2019}]";
/** Regex class for gershayim: U+05F4, ASCII double quote, right double quote. */
export const GERSHAYIM_CLASS = '["\u{5F4}\u{201D}]';

/**
 * Turns a lexicon word into a regex source. A space matches any whitespace run, and `'` / `"` match
 * an optional geresh / gershayim (any variant), so "סופש", "סופ"ש" (ASCII quote) and "סופ" followed
 * by a real gershayim and "ש" all match.
 */
export function lit(word: string): string {
  let out = '';
  for (const ch of word) {
    if (ch === ' ') out += '\\s+';
    else if (ch === "'") out += `${GERESH_CLASS}?`;
    else if (ch === '"') out += `${GERSHAYIM_CLASS}?`;
    else out += ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return out;
}

/** Alternation of lexicon words, longest first. */
export function alt(words: readonly string[]): string {
  return [...words]
    .sort((a, b) => b.length - a.length)
    .map(lit)
    .join('|');
}

// ───────────────────────────── days and months ─────────────────────────────

/** index is Sunday-based (0 = ראשון … 6 = שבת). `letter` is the "יום ה'" abbreviation. */
export const WEEKDAYS: readonly { index: number; name: string; letter: string }[] = [
  { index: 0, name: 'ראשון', letter: 'א' },
  { index: 1, name: 'שני', letter: 'ב' },
  { index: 2, name: 'שלישי', letter: 'ג' },
  { index: 3, name: 'רביעי', letter: 'ד' },
  { index: 4, name: 'חמישי', letter: 'ה' },
  { index: 5, name: 'שישי', letter: 'ו' },
  { index: 6, name: 'שבת', letter: 'ש' }
];

/** Gregorian month names as Israelis write them (מרץ and מרס are both common). */
export const MONTHS: readonly { month: number; names: readonly string[] }[] = [
  { month: 1, names: ['ינואר'] },
  { month: 2, names: ['פברואר'] },
  { month: 3, names: ['מרץ', 'מרס'] },
  { month: 4, names: ['אפריל'] },
  { month: 5, names: ['מאי'] },
  { month: 6, names: ['יוני'] },
  { month: 7, names: ['יולי'] },
  { month: 8, names: ['אוגוסט'] },
  { month: 9, names: ['ספטמבר'] },
  { month: 10, names: ['אוקטובר'] },
  { month: 11, names: ['נובמבר'] },
  { month: 12, names: ['דצמבר'] }
];

// ───────────────────────────── relative-date phrases ─────────────────────────────

/** word → days from today. */
export const RELATIVE_DAYS: Readonly<Record<string, number>> = {
  היום: 0,
  מחר: 1,
  מחרתיים: 2
};

export const PERIOD_PHRASES = {
  /** "השבוע" → Saturday of this week. */
  thisWeek: ['השבוע'],
  /** "סוף השבוע", "בסופ"ש" → the coming Friday. */
  weekend: ['סוף השבוע', 'סוף שבוע', 'סופ"ש'],
  /** "בשבוע הבא" → next Sunday. */
  nextWeek: ['שבוע הבא'],
  /** "בחודש הבא" → the 1st of next month. */
  nextMonth: ['חודש הבא'],
  /** "סוף החודש" → the last day of this month. */
  monthEnd: ['סוף החודש', 'סוף חודש']
} as const;

export type OffsetUnit = 'day' | 'week' | 'month';

/** Unit nouns after "בעוד N". */
export const OFFSET_UNITS: Readonly<Record<string, OffsetUnit>> = {
  יום: 'day',
  ימים: 'day',
  שבוע: 'week',
  שבועות: 'week',
  חודש: 'month',
  חודשים: 'month'
};

/** Dual forms that already carry the count: "בעוד שבועיים". */
export const DUAL_UNITS: Readonly<Record<string, OffsetUnit>> = {
  יומיים: 'day',
  שבועיים: 'week',
  חודשיים: 'month'
};

/** Spelled-out counts for "בעוד שלושה ימים" (feminine and masculine forms). */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  שני: 2,
  שתי: 2,
  שניים: 2,
  שתיים: 2,
  שלושה: 3,
  שלוש: 3,
  ארבעה: 4,
  ארבע: 4,
  חמישה: 5,
  חמש: 5,
  שישה: 6,
  שש: 6,
  שבעה: 7,
  שבע: 7,
  שמונה: 8,
  תשעה: 9,
  תשע: 9,
  עשרה: 10,
  עשר: 10
};

/** "ביום חמישי הקרוב": "the coming one" adds nothing, so it is consumed with the weekday. */
export const UPCOMING_WORDS = ['הקרוב', 'הקרובה'];

/** "בעוד" = "in (a span of time)". Its leading ב is part of the word, not a prefix to peel off. */
export const IN_WORD = 'בעוד';
/** Trailing "one": "בעוד שבוע אחד". */
export const ONE_WORDS = ['אחד', 'אחת'];

// ───────────────────────────── deadline words ─────────────────────────────

/** "עד <date>" makes the date a dueDate. */
export const UNTIL_WORD = 'עד';
/** "מועד אחרון" marks a hard deadline (and introduces a due date like עד does). */
export const HARD_DEADLINE_PHRASE = 'מועד אחרון';
/** "כל" before a date phrase means a repeat or a span ("כל השבוע", "כל יום ראשון"), not a date. */
export const EVERY_WORD = 'כל';
/** "לא" before a priority word negates it: "לא דחוף". */
export const NEGATION_WORD = 'לא';
/**
 * A dd/mm or dd.mm followed by one of these is a quantity ("1/2 קילו", "2.5 ליטר", "3.5 ש"ח"),
 * not a date. Without this guard a shopping list would silently grow a due date.
 */
export const UNIT_WORDS = [
  'קילו',
  'קילוגרם',
  'ק"ג',
  'גרם',
  'ליטר',
  'מ"ל',
  'מטר',
  'ס"מ',
  'מ"מ',
  'ק"מ',
  'קילומטר',
  'אחוז',
  'שקל',
  'שקלים',
  'ש"ח',
  '₪',
  '%',
  'יחידות',
  'כוס',
  'כוסות',
  'כף',
  'כפות',
  'כפית',
  'דקות',
  'שעות',
  'שנים'
];
/** "שעה" introduces a clock time: "בשעה 17:30", "בשעה 5". */
export const HOUR_WORD = 'שעה';
/** A bare hour below this (1–7) is read as afternoon: "בשעה 5" → 17:00. */
export const AFTERNOON_BEFORE_HOUR = 8;

// ───────────────────────────── priority ─────────────────────────────

/** Level order: later entries win. "!" and "!!" are handled separately in the parser. */
export const PRIORITY_WORDS: readonly {
  priority: Exclude<Priority, 'normal'>;
  words: readonly string[];
}[] = [
  { priority: 'high', words: ['חשוב', 'חשובה', 'חשובים', 'חשובות'] },
  { priority: 'urgent', words: ['דחוף', 'דחופה', 'דחופים', 'דחופות'] }
];

// ───────────────────────────── recurrence ─────────────────────────────

export const RECURRENCE_WORDS: Readonly<Record<RecurrenceFreq, readonly string[]>> = {
  weekly: ['כל שבוע', 'פעם בשבוע', 'שבועי', 'שבועית'],
  monthly: ['כל חודש', 'פעם בחודש', 'חודשי', 'חודשית'],
  yearly: ['כל שנה', 'פעם בשנה', 'שנתי', 'שנתית']
};

// ───────────────────────────── categories ─────────────────────────────

/**
 * Category keywords in Blueprint §6 table order. The FIRST category that has any keyword in the
 * text wins, so "להזמין תור לרופא" is health (health precedes shopping, which owns "להזמין") and
 * "לקנות מתנה" is shopping (shopping precedes family, which owns "מתנה").
 */
export const CATEGORY_KEYWORDS: readonly { id: CategoryId; keywords: readonly string[] }[] = [
  { id: 'returns', keywords: ['להחזיר', 'להחליף', 'החזרה', 'החלפה', 'זיכוי'] },
  {
    id: 'car',
    keywords: ['רכב', 'מוסך', 'טסט', 'צמיג', 'צמיגים', 'מצבר', 'שמן', "פנצ'ר", 'ביטוח רכב']
  },
  {
    id: 'health',
    keywords: ['רופא', 'רופאת', 'תור', 'בדיקה', 'מרפאה', 'שיניים', 'תרופה', 'מרשם', 'קופת חולים']
  },
  {
    id: 'finance',
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
    id: 'home',
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
  { id: 'shopping', keywords: ['לקנות', 'לרכוש', 'להזמין', 'סופר', 'קניות'] },
  { id: 'family', keywords: ['יום הולדת', 'מתנה', 'אירוע', 'חתונה', 'ברית'] }
];
