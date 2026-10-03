// Hebrew lexicon for the quick-add parser (Blueprint §6): day names, month names, relative-date
// phrases, time-of-day words, priority words, recurrence words, category keywords and the context
// words that veto a match.
//
// This file is data plus three tiny helpers (`lit`, `litStrict`, `alt`) that turn lexicon strings into
// regex source. All words are stored NFC, without niqqud. The parser matches against text that is
// normalised the same way (niqqud removed, maqaf and hyphens treated as spaces), so none of that is
// needed here.

import type { CategoryId, Priority, RecurrenceFreq } from '../domain/types';

// ───────────────────────────── prefixes and punctuation ─────────────────────────────

/** One-letter Hebrew prefixes a word may carry: ו ה ב ל מ ש כ (and, the, in, to, from, that, like). */
export const PREFIX_LETTERS = 'והבלמשכ';
/** At most two stacked prefixes, e.g. ו+ב in "וביום". */
export const MAX_PREFIXES = 2;
/** Priority words must NOT take ל: "לדחוף" means "to push" and "לחשוב" means "to think". */
export const PRIORITY_PREFIX_LETTERS = 'והבמשכ';

/** Regex class for a geresh: U+05F3, ASCII apostrophe, right single quote. */
export const GERESH_CLASS = "['\u{5F3}\u{2019}]";
/** Regex class for gershayim: U+05F4, ASCII double quote, right double quote. */
export const GERSHAYIM_CLASS = '["\u{5F4}\u{201D}]';

function toSource(word: string, marksRequired: boolean): string {
  const q = marksRequired ? '' : '?';
  let out = '';
  for (const ch of word) {
    if (ch === ' ') out += '\\s+';
    else if (ch === "'") out += `${GERESH_CLASS}${q}`;
    else if (ch === '"') out += `${GERSHAYIM_CLASS}${q}`;
    else out += ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return out;
}

/**
 * Turns a lexicon word into a regex source. A space matches any whitespace run, and `'` / `"` match
 * an OPTIONAL geresh / gershayim (any variant), so "סופש", "סופ"ש" (ASCII quote) and "סופ" followed
 * by a real gershayim and "ש" all match.
 */
export function lit(word: string): string {
  return toSource(word, false);
}

/** Like `lit`, but the geresh / gershayim is REQUIRED: "מס'" (number) must not match "מס" (tax). */
export function litStrict(word: string): string {
  return toSource(word, true);
}

/** Alternation of lexicon words, longest first. */
export function alt(words: readonly string[], toRegex: (word: string) => string = lit): string {
  return [...words]
    .sort((a, b) => b.length - a.length)
    .map(toRegex)
    .join('|');
}

// ───────────────────────────── days and months ─────────────────────────────

/**
 * index is Sunday-based (0 = ראשון … 6 = שבת). `letter` is the "יום ה'" abbreviation. `aliases` are
 * common misspellings (and the defective spelling ששי), matched like the name.
 */
export const WEEKDAYS: readonly {
  index: number;
  name: string;
  letter: string;
  aliases: readonly string[];
}[] = [
  { index: 0, name: 'ראשון', letter: 'א', aliases: [] },
  { index: 1, name: 'שני', letter: 'ב', aliases: [] },
  { index: 2, name: 'שלישי', letter: 'ג', aliases: ['שלשי'] },
  { index: 3, name: 'רביעי', letter: 'ד', aliases: ['רבעי'] },
  { index: 4, name: 'חמישי', letter: 'ה', aliases: ['חמשי'] },
  { index: 5, name: 'שישי', letter: 'ו', aliases: ['ששי'] },
  { index: 6, name: 'שבת', letter: 'ש', aliases: [] }
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

/** word → days from today ("מחרתים" is the common misspelling of מחרתיים). */
export const RELATIVE_DAYS: Readonly<Record<string, number>> = {
  היום: 0,
  הערב: 0,
  מחר: 1,
  מחרתיים: 2,
  מחרתים: 2
};

export const PERIOD_PHRASES = {
  /** "השבוע" → weekHorizon(today): this Saturday, or next Saturday on Friday/Saturday. */
  thisWeek: ['השבוע'],
  /** "סוף השבוע", "בסופ"ש" → the coming Friday (today, on a Friday: decision (f)). */
  weekend: ['סוף השבוע', 'סוף שבוע', 'סופ"ש'],
  /** "בשבוע הבא" → next Sunday. */
  nextWeek: ['שבוע הבא'],
  /** "בחודש הבא" → the 1st of next month. */
  nextMonth: ['חודש הבא'],
  /** "סוף החודש" → the last day of this month. */
  monthEnd: ['סוף החודש', 'סוף חודש'],
  // composites: matched as one phrase before any of their parts
  /** "סוף החודש הבא" → the last day of next month. */
  nextMonthEnd: ['סוף החודש הבא', 'סוף חודש הבא'],
  /** "תחילת החודש הבא" → the 1st of next month. */
  nextMonthStart: ['תחילת החודש הבא', 'תחילת חודש הבא'],
  /** "סוף השבוע הבא" → the Friday of next week. */
  nextWeekEnd: ['סוף השבוע הבא', 'סוף שבוע הבא'],
  /** "תחילת השבוע הבא" → next Sunday. */
  nextWeekStart: ['תחילת השבוע הבא', 'תחילת שבוע הבא'],
  /** "(עד) סוף היום" → today. */
  dayEnd: ['סוף היום', 'סוף יום']
} as const;

/** "שבוע הבא" inside a weekday composite ("ביום שלישי בשבוע הבא"). */
export const NEXT_WEEK_PHRASE = 'שבוע הבא';
/** "השבוע" inside a weekday composite ("ביום חמישי השבוע"). */
export const THIS_WEEK_PHRASE = 'השבוע';

/**
 * A period word (היום, השבוע, …) right after one of these is part of another expression, not a date:
 * "סדר היום" (agenda), "פרשת השבוע" (weekly Torah portion), "באמצע השבוע", "כל היום" (all day long).
 * The composites ("סוף השבוע", "סוף היום", "תחילת החודש הבא") are matched before this rule applies.
 */
export const PERIOD_MODIFIERS = ['סוף', 'תחילת', 'אמצע', 'סדר', 'פרשת', 'כל'];

/** Words after a weekday that add nothing but "the coming / this one": consumed with the weekday. */
export const DAY_MODIFIERS = ['הקרוב', 'הקרובה', 'הבא', 'הבאה', 'הזה', 'הזאת', 'הזו'];
/** "בראשון לציון", "ביום ראשון לחודש" (the 1st): the day name is something else. */
export const DAY_NAME_VETO_NEXT = ['לציון', 'לחודש'];
/** "לטפל בראשון לפני השני" (the first one before the second): vetoes a BARE day name only. */
export const BARE_DAY_VETO_NEXT = ['לפני'];
/** "ערב שבת", "בערב יום שישי": the EVE of that day, which is ambiguous; never read as the day. */
export const EVE_WORD = 'ערב';

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

/** "בעוד" = "in (a span of time)". Its leading ב is part of the word, not a prefix to peel off. */
export const IN_WORD = 'בעוד';
/** "החל מ-1/11", "החל ממחר" ("starting"): consumed with the date. */
export const STARTING_WORD = 'החל';
/** "בין 15/10 ל-20/10": one phrase that takes the first date (like a time range). */
export const RANGE_WORD = 'בין';
/** Trailing "one": "בעוד שבוע אחד". */
export const ONE_WORDS = ['אחד', 'אחת'];
/** "לחודש" / "בחודש" after a day-of-month number: "ה-10 לחודש". */
export const OF_MONTH_WORDS = ['לחודש', 'בחודש'];

// ───────────────────────────── deadline words ─────────────────────────────

/** "עד <date>" makes the date a dueDate. */
export const UNTIL_WORD = 'עד';
/** "לא יאוחר מ<date>" ("no later than") introduces a due date like עד. */
export const NOT_LATER_PHRASE = 'לא יאוחר';
/** "מועד אחרון" marks a hard deadline (and introduces a due date like עד does). */
export const HARD_DEADLINE_PHRASE = 'מועד אחרון';
/** "בתאריך 15/10", "עד לתאריך 15/10": part of the date phrase. */
export const DATE_WORD = 'תאריך';
/** "כל" before a date phrase means a repeat or a span ("כל השבוע", "כל יום ראשון"), not a date. */
export const EVERY_WORD = 'כל';
/** "לא" before a priority word negates it: "לא דחוף". */
export const NEGATION_WORD = 'לא';

// ───────────────────────────── numbers that are not dates (C1) ─────────────────────────────

/**
 * A dd/mm or dd.mm followed by one of these is a quantity ("1/2 קילו", "2.5 ליטר", "1.5 אלף"), not
 * a date. Without this guard a shopping list would silently grow a due date.
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
  'אחוזים',
  'שקל',
  'שקלים',
  'ש"ח',
  'דולר',
  'יורו',
  'אלף',
  'אלפים',
  'מיליון',
  'מליון',
  'מיליארד',
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

/**
 * An un-introduced number right after one of these (any prefixes) is an address, a size, a grade or
 * a version, not a date: "דירה 4/12", "למידה 10/12", "ציון 9/10", "גרסה 17.1". The abbreviations
 * need their geresh ("מס'" is "number"; a bare "מס" is "tax").
 */
export const NUMBER_CONTEXT_WORDS = [
  'דירה',
  'רחוב',
  "רח'",
  "מס'",
  'מספר',
  'מידה',
  'ציון',
  'קומה',
  'בניין',
  'כניסה',
  'סניף',
  'גרסה',
  'חדר',
  'עמוד',
  "עמ'",
  'פרק',
  'סעיף',
  'כביש',
  'קו',
  'שער'
];
/** A street name may be up to three words long: "רחוב בן גוריון 4/12". */
export const STREET_WORDS = ['רחוב', "רח'", 'שדרות', "שד'"];
/** A year-less, un-introduced dd/mm further ahead than this is not a date (C1e). §6 "3/1" is 91. */
export const MAX_BARE_DATE_DAYS_AHEAD = 120;
/** A year-less date up to this many days back stays in the current year: overdue (decision c). */
export const PAST_GRACE_DAYS = 14;

// ───────────────────────────── times ─────────────────────────────

/** "שעה" introduces a clock time: "בשעה 17:30", "בשעה 5". */
export const HOUR_WORD = 'שעה';
/** "בין השעות 10 ל-12". */
export const HOURS_WORD = 'שעות';
/** "בין 10:00 ל-12:00". */
export const BETWEEN_WORD = 'בין';
/** A bare, unpadded hour below this (1–7) is read as afternoon: "בשעה 5" → 17:00. */
export const AFTERNOON_BEFORE_HOUR = 8;

export type DayPart = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

/** Part-of-day words. Right after a time they fix AM/PM; next to a date they are just consumed. */
export const DAY_PARTS: Readonly<Record<DayPart, readonly string[]>> = {
  morning: ['בבוקר', 'לפנות בוקר', 'לפני הצהריים', 'לפנה"צ'],
  noon: ['בצהריים', 'בצהרים'],
  afternoon: ['אחה"צ', 'אחרי הצהריים', 'אחר הצהריים', 'אחרי הצהרים', 'אחר הצהרים'],
  evening: ['בערב'],
  night: ['בלילה']
};

/** "הערב" (this evening) is today, and steers a bare time to the evening. */
export const DATE_DAY_PARTS: Readonly<Record<string, DayPart>> = { הערב: 'evening' };

/** "בשעה 5 וחצי" = 17:30. */
export const MINUTE_WORDS: Readonly<Record<string, number>> = { חצי: 30, רבע: 15 };

/** A bare H:MM after one of these is a score, a ratio, a version or a verse, not a time:
 *  "ניצחנו 3:10", "גרסה 2:10", "פרק 3:16". */
export const SCORE_WORDS = [
  'גרסה',
  'גירסה',
  'פרק',
  'פסוק',
  'תוצאה',
  'תוצאת',
  'ניצחנו',
  'הפסדנו',
  'ניצחו',
  'הפסידו',
  'ניצחון',
  'הפסד',
  'תיקו',
  'יחס',
  'ציון'
];
/** A bare H:MM before one of these is a duration: "1:30 שעות". */
export const DURATION_WORDS = ['שעות', 'שעה', 'דקות', 'דקה', 'שניות', "דק'"];

// ───────────────────────────── priority ─────────────────────────────

/** Level order: later entries win. "!!" is handled separately in the parser; a single "!" is not
 *  a priority (decision b: Israelis end ordinary sentences with "!"). */
export const PRIORITY_WORDS: readonly {
  priority: Exclude<Priority, 'normal'>;
  words: readonly string[];
}[] = [
  { priority: 'high', words: ['חשוב', 'חשובה', 'חשובים', 'חשובות'] },
  { priority: 'urgent', words: ['דחוף', 'דחופה', 'דחופים', 'דחופות'] }
];

/** Intensifiers consumed together with an adjacent priority word: "ממש דחוף", "זה חשוב". */
export const INTENSIFIERS_BEFORE = ['זה', 'ממש', 'הכי', 'סופר', 'מאוד', 'מאד', 'כל כך', 'כ"כ'];
/** …and after it: "חשוב מאוד", "חשוב לי", "דחוף ביותר". */
export const INTENSIFIERS_AFTER = ['מאוד', 'מאד', 'ממש', 'לי', 'ביותר'];

// ───────────────────────────── recurrence ─────────────────────────────

/** Unambiguous recurrence phrases, anywhere in the line. */
export const RECURRENCE_PHRASES: Readonly<Record<RecurrenceFreq, readonly string[]>> = {
  weekly: ['כל שבוע', 'פעם בשבוע'],
  monthly: ['כל חודש', 'פעם בחודש'],
  yearly: ['כל שנה', 'פעם בשנה']
};

/**
 * Recurrence adjectives. After a noun they describe it ("מנוי שנתי" is an annual subscription, not a
 * yearly task), so they count only at the start of the line, after punctuation, or after "באופן".
 */
export const RECURRENCE_ADJECTIVES: Readonly<Record<RecurrenceFreq, readonly string[]>> = {
  weekly: ['שבועי', 'שבועית'],
  monthly: ['חודשי', 'חודשית'],
  yearly: ['שנתי', 'שנתית']
};
/** "באופן שבועי" (on a weekly basis). */
export const ADVERB_LEAD = 'באופן';

// ───────────────────────────── title tidy ─────────────────────────────

/** A leading "remind me" adds nothing to the task title. */
export const REMINDER_LEADS = ['תזכיר לי', 'תזכירי לי', 'להזכיר לי'];

// ───────────────────────────── categories ─────────────────────────────

/** One category keyword and the conditions under which it counts. */
export interface CategoryKeyword {
  word: string;
  /** A verb ("לשלם"): never a "specific noun" that outranks a weak returns verb. */
  verb?: boolean;
  /** Counts only when one of these words (any prefixes) is somewhere in the line. */
  needs?: readonly string[];
  /** The attached prefix must contain one of these letters ("הדוד", "בדוד"). */
  needsPrefix?: string;
  /** The attached prefix must not contain any of these letters ("לשמן" is "to oil"). */
  badPrefix?: string;
  /** The attached prefix must not END with this letter ("מחשבון" is a calculator, not מ+חשבון). */
  badPrefixEnd?: string;
  /** Must not be followed by a geresh or a dot ("מס'" / "מס." is "number"). */
  notAbbrev?: boolean;
  /** Must not be followed by one of these words ("זיכוי מס" is a tax credit). */
  notBefore?: readonly string[];
  /** Must not come right after one of these words ("ארצות הברית" is the USA, not a bris). */
  notAfter?: readonly string[];
}

const words = (...list: string[]): CategoryKeyword[] => list.map((word) => ({ word }));
const verbs = (...list: string[]): CategoryKeyword[] => list.map((word) => ({ word, verb: true }));

const REPAIR_WORDS = ['לתקן', 'תיקון', 'לתיקון', 'נזילה'];

/**
 * Category keywords in Blueprint §6 table order. Detection (see category.ts):
 * - returns is chosen STRONGLY when a returns word comes with a store or clothing word (STORE_WORDS);
 *   only a strong returns choice turns "עד <date>" into a hard deadline;
 * - otherwise returns is chosen WEAKLY only when no specific noun of car/health/finance/home is in
 *   the line ("להחליף מצבר" is car, "להחליף נורה" is home, "להחליף מתנה" is still returns);
 * - otherwise the FIRST category in table order with a keyword in the text wins, so "להזמין תור
 *   לרופא" is health (health precedes shopping) and "לקנות מתנה" is shopping (before family).
 * This deviates from the plain §6 list on purpose (decision (a)): precision beats recall.
 */
export const CATEGORY_KEYWORDS: readonly {
  id: CategoryId;
  keywords: readonly CategoryKeyword[];
}[] = [
  {
    id: 'returns',
    keywords: [
      ...verbs('להחזיר', 'להחליף'),
      ...words('החזרה', 'החזרת', 'החלפה', 'החלפת'),
      { word: 'זיכוי', notBefore: ['מס', 'ממס'] }
    ]
  },
  {
    id: 'car',
    keywords: [
      ...words('רכב', 'מוסך', 'טסט', 'צמיג', 'צמיגים', 'מצבר', "פנצ'ר", 'ביטוח רכב'),
      {
        word: 'שמן',
        needs: ['רכב', 'מנוע', 'החלפת', 'החלפה', 'להחליף', 'מוסך'],
        badPrefix: 'ל'
      }
    ]
  },
  {
    id: 'health',
    keywords: [
      ...words('רופא', 'רופאה', 'רופאת', 'בדיקה', 'מרפאה', 'שיניים', 'תרופה', 'מרשם', 'קופת חולים'),
      {
        word: 'תור',
        needs: ['רופא', 'רופאה', 'רופאת', 'מרפאה', 'שיניים', 'בדיקה', 'קופת חולים']
      }
    ]
  },
  {
    id: 'finance',
    keywords: [
      ...words('ארנונה', 'חשבונית', 'בנק', 'ביטוח', 'טופס', 'תשלום', 'ביטוח לאומי', 'משכנתא'),
      { word: 'חשבון', badPrefixEnd: 'מ' },
      { word: 'מס', notAbbrev: true },
      ...verbs('לשלם')
    ]
  },
  {
    id: 'home',
    keywords: [
      ...verbs('לתקן'),
      ...words('תיקון', 'נזילה', 'אינסטלטור', 'חשמלאי', 'מזגן', 'הדברה'),
      { word: 'נורה', badPrefixEnd: 'מ' }, // "מנורה" is a lamp, not מ+נורה
      ...words('דוד שמש', 'דוד חשמל'),
      { word: 'דוד', needsPrefix: 'הב', badPrefix: 'ל', needs: REPAIR_WORDS },
      { word: 'צבע', badPrefix: 'ב' }
    ]
  },
  {
    id: 'shopping',
    keywords: [
      ...verbs('לקנות', 'לרכוש', 'להזמין'),
      ...words('קניות'),
      { word: 'סופר', badPrefixEnd: 'מ' } // "מסופר" is "narrated"; "מהסופר" is fine
    ]
  },
  {
    id: 'family',
    keywords: [
      ...words('יום הולדת', 'מתנה', 'אירוע', 'חתונה'),
      { word: 'ברית', notAfter: ['ארצות'] }
    ]
  }
];

/** A returns word together with one of these is a strong returns signal. */
export const STORE_WORDS = [
  'בגד',
  'בגדים',
  'חולצה',
  'חולצות',
  'מכנסיים',
  'שמלה',
  'שמלות',
  'נעליים',
  'נעל',
  'חנות',
  'קניון',
  'זיכוי',
  'מידה',
  'קבלה'
];

/** Categories whose nouns outrank a weak returns verb ("להחליף מצבר" is car). Shopping and family
 *  nouns do not: "להחליף מתנה" (exchange a gift) is a return. */
export const SPECIFIC_NOUN_CATEGORIES: readonly CategoryId[] = ['car', 'health', 'finance', 'home'];
