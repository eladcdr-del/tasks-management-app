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
  /**
   * "השבוע", "השבוע הזה", "במהלך השבוע", "בשבוע הקרוב" → a week plan ending weekHorizon(today):
   * this Saturday, or next Saturday on Friday/Saturday. ("שבוע הזה" with its prefix is "בשבוע הזה".)
   */
  thisWeek: ['השבוע', 'שבוע הזה', 'מהלך השבוע', 'מהלך השבוע הזה', 'שבוע הקרוב'],
  /** "סוף השבוע", "בסופ"ש" → the coming Friday (today, on a Friday: decision (f)). */
  weekend: ['סוף השבוע', 'סוף שבוע', 'סופ"ש'],
  /**
   * "בשבוע הבא" → a week plan ending the Saturday of next week. After "עד" it is next Sunday (the
   * start of next week), as before the week plans.
   */
  nextWeek: ['שבוע הבא', 'מהלך השבוע הבא'],
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
/** "החוג של יום שלישי", "הרשימה של מחר": a date after "של" describes a noun, it is no date. */
export const OF_WORD = 'של';
/**
 * A date inside a ש-clause says when THAT happened or happens, not when to do the task ("החבילה
 * שהזמנו ביום ראשון", "הסיר שהיא נתנה בשבת"), so it is no date. Many nouns and adjectives start
 * with ש (שולחן, שמלה, שגרתי), so only these words open such a clause: ש + ה… ("שהזמנו", "שהיא",
 * "שהאסיפה"), ש + one of these pronouns, or ש + a "we" past verb ("שקנינו"). The clause runs to the
 * next punctuation mark or a "ו + infinitive" ("ולהתקשר"), which goes back to the task itself.
 */
export const SHIN_CLAUSE_PRONOUNS = ['אני', 'אנחנו', 'אתה', 'את', 'אתם', 'אתן'];
/** "החוג שלנו": a possessive, not a ש-clause. */
export const SHIN_POSSESSIVES = ['שלנו'];
/** "במוצ"ש", "במוצאי שבת" → Saturday evening (tonight, when said on Saturday). */
export const SATURDAY_NIGHT_PHRASES = ['מוצ"ש', 'מוצאי שבת', 'מוצאי השבת'];
/**
 * "לשישי", "לשבת" (for Friday / Shabbat): a target day, only at the end of the line or a clause.
 * What is for Shabbat is done before it: "לשבת" alone plans the Friday.
 */
export const LAMED_DAY_NAMES = ['שישי', 'ששי', 'שבת'];
/** "מקום לשבת", "צריך לשבת": here לשבת is the verb "to sit", not "for Shabbat". */
export const LAMED_DAY_VETO_BEFORE = [
  'מקום',
  'איפה',
  'כיסא',
  'כסא',
  'כיסאות',
  'ספסל',
  'זמן',
  'נוח',
  'צריך',
  'צריכה',
  'צריכים',
  'רוצה',
  'רוצים',
  'אפשר',
  'לבקש',
  'להגיד',
  'תגיד',
  'תגידי'
];
/**
 * Words that name a day or a season without being a date chip: with one of them in the line, a
 * lone time does not imply today or tomorrow ("ארוחת חג 19:30", council M4). Weekday names are
 * covered by the date candidates themselves.
 */
export const DAY_LIKE_WORDS = [
  'חג',
  'חגים',
  'פסח',
  'סוכות',
  'חנוכה',
  'פורים',
  'ראש השנה',
  'כיפור',
  'שבועות',
  'מוצאי',
  'שבת',
  'סופ"ש',
  'חופש',
  'חופשה'
];

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
/** "לפני <date>" is due the day BEFORE that date (council M3). */
export const BEFORE_WORD = 'לפני';
/** "שבוע לפני 15/10": an offset before "לפני" that the parser does not read, so no date at all. */
export const BEFORE_OFFSET_WORDS = [
  'יום',
  'יומיים',
  'ימים',
  'שבוע',
  'שבועיים',
  'שבועות',
  'חודש',
  'חודשיים',
  'חודשים',
  'שעה',
  'שעתיים',
  'שעות',
  'דקות',
  'שנה',
  'שנתיים',
  'שנים'
];
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
  'שער',
  // an installment, "3 out of 10" (council M2)
  'תשלום',
  'תשלומים',
  'מתוך'
];
/** A street name may be up to three words long: "רחוב בן גוריון 4/12". */
export const STREET_WORDS = ['רחוב', "רח'", 'שדרות', "שד'"];
/** A year-less, un-introduced dd/mm further ahead than this is not a date (C1e). §6 "3/1" is 91. */
export const MAX_BARE_DATE_DAYS_AHEAD = 120;
/**
 * A year-less date up to this many days back stays in the current year: overdue (decision c). An
 * explicit year further back than this is not a date at all ("חשבונית 12/10/2020", council M2).
 */
export const PAST_GRACE_DAYS = 14;
/**
 * "ב-29.9" is as likely a price as a date: a dotted dd.m after ב counts only within
 * [today − PAST_GRACE_DAYS, today + this] (council M2).
 */
export const MAX_BET_DOTTED_DAYS_AHEAD = 120;

// ───────────────────────────── times ─────────────────────────────

/** "שעה" introduces a clock time: "בשעה 17:30", "בשעה 5". */
export const HOUR_WORD = 'שעה';
/** "בין השעות 10 ל-12". */
export const HOURS_WORD = 'שעות';
/** "בין 10:00 ל-12:00". */
export const BETWEEN_WORD = 'בין';
/** An unpadded hour from 1 up to this one is read as afternoon: "בשעה 5" → 17:00 (council C1). */
export const PM_UNTIL_HOUR = 5;
/**
 * Unpadded hours that are genuinely ambiguous: "7:30" is the school run or dinner. With no part of
 * day and no cue (TIME_CUES) they get no time chip and stay in the title (council C1).
 */
export const AMBIGUOUS_HOURS: readonly number[] = [6, 7];
/**
 * Words anywhere in the line that settle an ambiguous 6 or 7: waking up, the school run, a flight
 * or a blood test is in the morning; dinner, an evening or a party is in the evening. A line with
 * both stays ambiguous.
 */
export const TIME_CUES: Readonly<Record<'am' | 'pm', readonly string[]>> = {
  am: [
    'להעיר',
    'הסעה',
    'הסעות',
    'להסיע',
    'גן',
    'בית ספר',
    'בית הספר',
    'ביה"ס',
    'טיסה',
    'טיסות',
    'המראה',
    'בדיקת דם',
    'בדיקות דם'
  ],
  pm: ['ארוחת ערב', 'ערב', 'מסיבה', 'מסיבת']
};

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

/**
 * Level order: later entries win. Words may be stretched ("דחוףףף"). Punctuation is handled
 * separately in the parser: a single "!" is nothing (decision b: Israelis end ordinary sentences
 * with "!"), and "!!" / "!!!" is at most `high` (council: emphasis, never urgent on its own).
 */
export const PRIORITY_WORDS: readonly {
  priority: Exclude<Priority, 'normal'>;
  words: readonly string[];
}[] = [
  { priority: 'high', words: ['חשוב', 'חשובה', 'חשובים', 'חשובות'] },
  { priority: 'urgent', words: ['דחוף', 'דחופה', 'דחופים', 'דחופות', 'בדחיפות'] }
];

/** Intensifiers consumed together with an adjacent priority word: "ממש דחוף", "זה חשוב". */
export const INTENSIFIERS_BEFORE = ['זה', 'ממש', 'הכי', 'סופר', 'מאוד', 'מאד', 'כל כך', 'כ"כ'];
/** …and after it: "חשוב מאוד", "חשוב לי", "דחוף ביותר". */
export const INTENSIFIERS_AFTER = ['מאוד', 'מאד', 'ממש', 'לי', 'לנו', 'ביותר'];
/** "לא דחוף אבל חשוב", "חשוב אך לא דחוף": one phrase, the level of the word that is not negated. */
export const CONTRAST_WORDS = ['אבל', 'אך'];
/** "אם דחוף, להתקשר": a condition, not a priority. */
export const CONDITION_WORD = 'אם';
/**
 * "חשוב לי שהילדים יאכלו" heads a ש-clause and is not a priority. A word right after it that starts
 * with ש is read as that clause unless it is one of these (a day, a time or a number).
 */
export const SHIN_WORDS_NOT_CLAUSE = [
  'שבת',
  'שבוע',
  'שבועיים',
  'שבועי',
  'שבועית',
  'שני',
  'שלישי',
  'שישי',
  'ששי',
  'שנה',
  'שנתי',
  'שעה',
  'שעתיים',
  'שתיים',
  'שתי',
  'שלוש',
  'שלושה',
  'שש',
  'שישה',
  'שבע',
  'שבעה',
  'שמונה'
];

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
  /** A verb ("לשלם"): never a "specific noun". */
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
 * What "להזמין" must be ordering to be shopping (council M5): never a person, a technician (home),
 * a taxi, a table, a place or an appointment.
 */
export const ORDERABLE_PRODUCTS = [
  'גז',
  'בלון גז',
  'מים',
  'פיצה',
  'אוכל',
  'משלוח',
  'ספה',
  'מקרר',
  'מכונת כביסה',
  'מייבש',
  'תנור',
  'מזרן',
  'רהיטים',
  'כיסאות',
  'מתנה',
  'מתנות',
  'בגדים',
  'נעליים',
  'ספרים',
  'ציוד',
  'חיתולים',
  'טיטולים',
  'סופר',
  'אמזון',
  'עלי אקספרס',
  'אליאקספרס',
  'איביי',
  'שיין',
  'אונליין',
  'אתר',
  'חבילה',
  'כרטיסים',
  'מוצר',
  'מוצרים'
];

/** "בחשבון" (maths class, "take into account") is finance only with one of these in the line. */
export const ACCOUNT_CONTEXT_WORDS = [
  'בנק',
  'לשלם',
  'תשלום',
  'חיוב',
  'חיובים',
  'העברה',
  'העברת',
  'יתרה',
  'עו"ש',
  'משכורת'
];

/**
 * Category keywords in Blueprint §6 table order. Detection (see category.ts):
 * - returns needs a returns word AND a strong signal: a store or clothing word, a receipt or credit,
 *   a store or mall name, or a returnable product (RETURNS_SIGNALS). A returns verb whose object is
 *   a call, money, the kids, bedding, a nappy… (RETURNS_VERB_VETOES) is no returns word at all
 *   (council M5). Returns outranks every other category; with a due date it is a hard deadline;
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
      ...words(
        'רכב',
        'אוטו',
        'מכונית',
        'מוסך',
        'טסט',
        'צמיג',
        'צמיגים',
        'מצבר',
        "פנצ'ר",
        'ביטוח רכב'
      ),
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
      // "חשבון חשמל" is a bill; "מבחן בחשבון" is maths and "לקחת בחשבון" is "take into account"
      { word: 'חשבון', badPrefix: 'ב', badPrefixEnd: 'מ' },
      { word: 'חשבון', needsPrefix: 'ב', needs: ACCOUNT_CONTEXT_WORDS },
      { word: 'מס', notAbbrev: true },
      ...verbs('לשלם')
    ]
  },
  {
    id: 'home',
    keywords: [
      ...verbs('לתקן'),
      ...words(
        'תיקון',
        'נזילה',
        'אינסטלטור',
        'חשמלאי',
        'טכנאי',
        'מזגן',
        'הדברה',
        'מנעול',
        'מנעולן'
      ),
      { word: 'נורה', badPrefixEnd: 'מ' }, // "מנורה" is a lamp, not מ+נורה
      ...words('דוד שמש', 'דוד חשמל'),
      { word: 'דוד', needsPrefix: 'הב', badPrefix: 'ל', needs: REPAIR_WORDS },
      { word: 'צבע', badPrefix: 'ב', notBefore: ['שיער', 'לשיער', 'השיער'] } // hair dye
    ]
  },
  {
    id: 'shopping',
    keywords: [
      ...verbs('לקנות', 'לרכוש'),
      { word: 'להזמין', verb: true, needs: ORDERABLE_PRODUCTS },
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

/**
 * The strong signals a returns word needs (council M5). `store` words (a store, a mall, a store
 * name, a receipt or credit, a size) also lift the "liftable" verb vetoes below; `items` (clothing
 * and returnable products) do not.
 */
export const RETURNS_SIGNALS: Readonly<Record<'store' | 'items', readonly string[]>> = {
  store: [
    'חנות',
    'קניון',
    'קבלה',
    'זיכוי',
    'מידה',
    'זארה',
    'H&M',
    'h&m',
    'קסטרו',
    'פוקס',
    'איקאה',
    'איקיאה',
    'עזריאלי'
  ],
  items: [
    'בגד',
    'בגדים',
    'חולצה',
    'חולצות',
    'מכנסיים',
    'שמלה',
    'שמלות',
    'נעליים',
    'נעל',
    'מתנה',
    'חבילה',
    'הזמנה'
  ]
};

/**
 * A returns verb followed by one of these objects ("להחזיר טלפון" is "call back", "להחליף סדינים"
 * is "change the sheets") is not a returns word. `liftable` vetoes give way to a store signal
 * ("להחזיר טלפון לחנות" is a return); `always` vetoes never do.
 */
export const RETURNS_VERB_VETOES: Readonly<
  Record<string, Readonly<Record<'always' | 'liftable', readonly string[]>>>
> = {
  להחזיר: {
    always: ['שיחה', 'שיחות', 'ילדים', 'ילד', 'ילדה', 'הביתה', 'חוב', 'חובות', 'הלוואה', 'תשובה'],
    liftable: ['טלפון', 'כסף']
  },
  להחליף: {
    always: [
      'סדינים',
      'מצעים',
      'טיטול',
      'טיטולים',
      'חיתול',
      'חיתולים',
      'מים',
      'ספק',
      'ספקים',
      'שמן'
    ],
    liftable: ['פלאפון', 'טלפון', 'מכשיר', 'בגדים', 'בגד', 'כסף']
  }
};
