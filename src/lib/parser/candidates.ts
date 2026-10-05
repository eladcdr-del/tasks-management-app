// Candidate finders for the quick-add parser: every phrase that MIGHT set a field, with the vetoes
// that keep a wrong chip from ever being offered ("a wrong chip is worse than no chip").
// Selection between candidates happens in quickAdd.ts.

import { weekHorizon } from '$lib/domain/buckets';
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  nextWeekday,
  startOfWeek,
  toISO,
  weekday
} from '$lib/domain/dates';
import { firstPlanDate, MAX_INTERVAL } from '$lib/domain/recurrence';
import type { ISODate, Priority, RecurrenceFreq } from '$lib/domain/types';
import {
  ADVERB_LEAD,
  AMBIGUOUS_HOURS,
  BARE_DAY_VETO_NEXT,
  BEFORE_OFFSET_WORDS,
  BEFORE_WORD,
  BETWEEN_WORD,
  CONDITION_WORD,
  CONTRAST_WORDS,
  DAILY_PHRASES,
  DAILY_VETO_NEXT,
  DATE_DAY_PARTS,
  DATE_WORD,
  DAY_LIKE_WORDS,
  DAY_MODIFIERS,
  DAY_NAME_VETO_NEXT,
  DAY_PARTS,
  DAYS_OF_WORDS,
  DUAL_UNITS,
  DURATION_WORDS,
  EVE_WORD,
  EVERY_WORD,
  GERESH_CLASS,
  HARD_DEADLINE_PHRASE,
  HOUR_WORD,
  HOURS_WORD,
  IN_WORD,
  INTENSIFIERS_AFTER,
  INTENSIFIERS_BEFORE,
  INTERVAL_DUALS,
  INTERVAL_UNITS,
  LAMED_DAY_NAMES,
  LAMED_DAY_VETO_BEFORE,
  MAX_BARE_DATE_DAYS_AHEAD,
  MAX_BET_DOTTED_DAYS_AHEAD,
  MINUTE_WORDS,
  MONTHS,
  NEGATION_WORD,
  NEXT_WEEK_PHRASE,
  NOT_LATER_PHRASE,
  NUMBER_CONTEXT_WORDS,
  NUMBER_WORDS,
  OF_MONTH_WORDS,
  OF_WORD,
  OFFSET_UNITS,
  ONCE_WORD,
  ONE_WORDS,
  PAST_GRACE_DAYS,
  PERIOD_MODIFIERS,
  PERIOD_PHRASES,
  PM_UNTIL_HOUR,
  PREFIX_LETTERS,
  PRIORITY_PREFIX_LETTERS,
  PRIORITY_WORDS,
  RECURRENCE_ADJECTIVES,
  RECURRENCE_PHRASES,
  RELATIVE_DAYS,
  RANGE_WORD,
  SATURDAY_NIGHT_PHRASES,
  SCORE_WORDS,
  SHIN_CLAUSE_PRONOUNS,
  SHIN_POSSESSIVES,
  SHIN_WORDS_NOT_CLAUSE,
  STARTING_WORD,
  STREET_WORDS,
  THIS_WEEK_PHRASE,
  TIME_CUES,
  TIMES_A_WEEK,
  UNIT_WORDS,
  UNTIL_WORD,
  WEEKDAYS,
  alt,
  lit,
  litStrict,
  type DayPart,
  type OffsetUnit
} from './lexicon';
import {
  AFTER,
  AFTER_NUM,
  ATTACHED,
  PFX,
  PFX_CAPTURE,
  anywhereRe,
  group,
  lastWordRe,
  lookback,
  rx1,
  rxg,
  scan,
  type Hit,
  type Normalized,
  type Span,
  WORD_CHAR_RE
} from './text';
import {
  dayOfMonthDate,
  isValidYMD,
  nextWeekdayOnOrAfter,
  startOfNextMonth,
  yearlessDate
} from './util';

// ───────────────────────────── types ─────────────────────────────

export type CandKind = 'date' | 'due' | 'hard' | 'time' | 'priority' | 'recurrence';

/** A clock time as written, resolved to 'HH:mm' only at selection (a date's part of day may steer it). */
export interface ClockParts {
  hour: number;
  minute: number;
  /** "05:30": a zero-padded hour is literal, never PM-guessed. */
  padded: boolean;
  /** "בשעה 6 בבוקר": the part of day written next to the time. */
  dayPart?: DayPart;
}

export interface Cand {
  kind: CandKind;
  /** Indices into the normalised text. */
  start: number;
  end: number;
  /** date, due; recurrence: the first date of "כל יום שלישי". */
  iso?: ISODate;
  /** due only: introduced by "עד" / "לא יאוחר מ" / "לפני" (until) or by "מועד אחרון" (hard). */
  intro?: 'until' | 'hard';
  /** date, due, recurrence: a part-of-day word consumed with the phrase ("מחר בבוקר"). */
  dayPart?: DayPart;
  /** date only: a week plan ("השבוע" / "בשבוע הבא"); `iso` is the Saturday that ends it. */
  week?: 'this' | 'next';
  /**
   * date, due: a phrase that is no date but must not let its parts be read alone, e.g. a weekday
   * and a date that disagree ("ביום חמישי 16/10") or "שבוע לפני 15/10". It wins overlaps like any
   * candidate, then sets nothing and consumes nothing.
   */
  void?: boolean;
  clock?: ClockParts;
  /** time only: the end of a range ("בין 8 ל-12"), carried on the chip label. */
  endClock?: ClockParts;
  priority?: Exclude<Priority, 'normal'>;
  freq?: RecurrenceFreq;
  /** recurrence only: every N periods ("כל שבועיים"), when not 1. */
  interval?: number;
  /** recurrence only: two or more listed weekdays ("כל שני וחמישי"), sorted. */
  weekdays?: number[];
}

export interface Ctx {
  input: string;
  norm: Normalized;
  text: string;
  today: ISODate;
}

// ───────────────────────────── shared pieces ─────────────────────────────

const LD = '\\p{L}\\p{N}';
const LETTER_RE = /[\p{L}\p{N}]/u;

const DAY_ENTRIES = WEEKDAYS.flatMap((w) =>
  [w.name, ...w.aliases].map((n) => [n, w.index] as const)
);
const DAY_BY_NAME = new Map(DAY_ENTRIES);
const DAY_BY_LETTER = new Map(WEEKDAYS.map((w) => [w.letter, w.index]));
const DAY_NAME_ALT = alt(DAY_ENTRIES.map(([n]) => n));
const LETTERS = WEEKDAYS.map((w) => w.letter).join('');
/**
 * "יום ה'" with a geresh, or a geresh-less "יום ה" at a word boundary: not before a bare number
 * ("ביום ה-15" is the 15th), but fine before a clock time ("יום ב 10:00").
 */
const WD_LETTER = `[${LETTERS}](?:${GERESH_CLASS}|(?![${LD}])(?!\\s?\\d{1,2}(?![:\\d])))`;
/** ביום ראשון / ליום ראשון / יום ה'. Not "היום ראשון" (today + a word) and not "מיום" (since). */
const WD_YOM = `ו?[בל]?יום\\s+(?:${DAY_NAME_ALT}|${WD_LETTER})`;
/** בראשון … בשבת (also "ב-שני" with a hyphen). */
const WD_BET = `ו?ב\\s?(?:${DAY_NAME_ALT})`;
const WD_ANY = `(?:${WD_YOM}|${WD_BET})`;
/** "הקרוב", "הבא", "הזה" after a weekday (captured: its presence lifts the C2 follower rule). */
const MODS = `(\\s+(?:${alt(DAY_MODIFIERS)})${AFTER})?`;

const NAME_IN_RE = rx1(`(${DAY_NAME_ALT})`);
const LETTER_IN_RE = rx1(`יום\\s+([${LETTERS}])`);

/** The weekday index (0 = Sunday) named in a matched weekday phrase. */
function weekdayIndexOf(phrase: string): number | undefined {
  const name = NAME_IN_RE.exec(phrase)?.[1];
  if (name) return DAY_BY_NAME.get(name);
  const letter = LETTER_IN_RE.exec(phrase)?.[1];
  return letter === undefined ? undefined : DAY_BY_LETTER.get(letter);
}

const DAY_PART_ALT = alt(Object.values(DAY_PARTS).flat());
const DAY_PART_RES = (Object.keys(DAY_PARTS) as DayPart[]).map((part) => ({
  part,
  re: rx1(`^(?:${alt(DAY_PARTS[part])})$`)
}));
/** The part of day a (normalised) part-of-day word names. */
function partOf(word: string): DayPart | undefined {
  return DAY_PART_RES.find(({ re }) => re.test(word))?.part;
}
const DAY_PART_NEXT_RE = rx1(`^\\s+(ו?(?:${DAY_PART_ALT}))${AFTER}`);

const ORIGINAL_SKIP_RE = /^[\s\p{Cf}]+/u;

/**
 * C2: a bare day name after ב counts only when followed by the end of the input, punctuation, a
 * part-of-day word, or another date or time phrase (`phraseStarts`).
 */
function followerOk(ctx: Ctx, end: number, phraseStarts: ReadonlySet<number>): boolean {
  const origEnd = ctx.norm.ends[end - 1] ?? ctx.input.length;
  const after = ctx.input.slice(origEnd).replace(ORIGINAL_SKIP_RE, '');
  if (after === '' || !LETTER_RE.test(after.charAt(0))) return true;
  if (DAY_PART_NEXT_RE.test(ctx.text.slice(end))) return true;
  return phraseStarts.has(end + 1);
}

/** True when nothing but punctuation (in the ORIGINAL input) separates `start` from the previous word. */
function separatedBefore(ctx: Ctx, start: number): boolean {
  const at = (i: number) => ctx.input.charAt(i);
  let i = (ctx.norm.starts[start] ?? 0) - 1;
  while (i >= 0 && /[\s\p{Cf}]/u.test(at(i))) i--;
  while (i >= 0 && /\p{M}/u.test(at(i))) i--; // niqqud belongs to the letter before it
  return i < 0 || !LETTER_RE.test(at(i));
}

// ───────────────────────────── dates ─────────────────────────────

interface NumericInfo {
  day: number;
  month: number;
  sep: string;
  monthDigits: number;
  yearful: boolean;
  /** introduced by its own prefix (ב/ל/ה/מ) or by "תאריך". */
  prefixed: boolean;
  /** "ב-29.9": its prefix has a ב (a dotted one may be a price, council M2). */
  bet: boolean;
}

interface DateHit {
  start: number;
  end: number;
  iso: ISODate;
  /** 'intro': only after עד / לא יאוחר / מועד אחרון; 'notLater': only after "לא יאוחר" (a מ-form). */
  needs?: 'intro' | 'notLater';
  /** C2: a bare day name after ב, valid only with an allowed follower. */
  strict?: boolean;
  /** A bare day name or "ה-N": a definite or plural noun (or "לפני") after it vetoes it. */
  bare?: boolean;
  /** A weekday phrase: "לציון" / "לחודש" after it, or "ערב" before it, vetoes it. */
  weekday?: boolean;
  /** A period word: a modifier before it ("סדר היום", "באמצע השבוע") vetoes it. */
  period?: boolean;
  /** "לחודש הבא": a day number before it belongs to a day-of-month phrase, valid or not. */
  monthTail?: boolean;
  dayPart?: DayPart;
  numeric?: NumericInfo;
  /** A numeric, month-name or "ה-15" date: it may pair with a weekday before it (council M1). */
  explicit?: boolean;
  /** A weekday + date pair that disagree, or "שבוע לפני …": blocks its parts, sets nothing. */
  void?: boolean;
  /** "השבוע" / "בשבוע הבא": a week plan unless "עד" introduces it. */
  week?: 'this' | 'next';
  /** "לשבת", "לשישי": a target day, only at the end of the line or a clause. */
  lamed?: boolean;
}

const RE_REL = rxg(`${PFX_CAPTURE}(${alt(Object.keys(RELATIVE_DAYS))})${AFTER}`);
const RE_YOM = rxg(`(${WD_YOM})${MODS}${AFTER}`);
const RE_BET_DAY = rxg(`(${WD_BET})${MODS}${AFTER}`);
/** Bare names are dates only after an introducer: "עד חמישי", "עד לחמישי", "לא יאוחר מחמישי". */
const RE_BARE_DAY = rxg(`([למ]?)(${DAY_NAME_ALT})${MODS}${AFTER}`);
/** "מיום חמישי" is "since Thursday" unless it follows "לא יאוחר". */
const RE_YOM_FROM = rxg(`מ\\s?(יום\\s+(?:${DAY_NAME_ALT}|${WD_LETTER}))${MODS}${AFTER}`);

const NEXT_WEEK_SRC = `${ATTACHED}${lit(NEXT_WEEK_PHRASE)}`;
// C3 composites: "ביום שלישי בשבוע הבא", "בשבוע הבא ביום שלישי", "ביום חמישי השבוע"
const RE_WD_NEXT_WEEK = rxg(`(${WD_ANY})${MODS}\\s+${NEXT_WEEK_SRC}${AFTER}`);
const RE_NEXT_WEEK_WD = rxg(`${PFX}${lit(NEXT_WEEK_PHRASE)}\\s+(${WD_ANY})${MODS}${AFTER}`);
const RE_WD_THIS_WEEK = rxg(`(${WD_ANY})\\s+${lit(THIS_WEEK_PHRASE)}${AFTER}`);

const RE_OFFSET = rxg(
  `${PFX}${IN_WORD}\\s+(?:(\\d{1,3}|${alt(Object.keys(NUMBER_WORDS))})\\s+(${alt(Object.keys(OFFSET_UNITS))})` +
    `|(${alt(Object.keys(DUAL_UNITS))})` +
    `|(${alt(['יום', 'שבוע', 'חודש'])})(?:\\s+(?:${alt(ONE_WORDS)}))?)${AFTER}`
);

/** "בעוד שבוע וחצי", "בעוד יומיים-שלושה": a half or a range after the offset; never read partially. */
const RE_OFFSET_TAIL = rx1(`^\\s+(?:ו?חצי|או|\\d+|${alt(Object.keys(NUMBER_WORDS))})${AFTER}`);

const DATE_WORD_LEAD = `(?:(${ATTACHED}${lit(DATE_WORD)})\\s+)?`;
const RE_NUMERIC = rxg(
  `${DATE_WORD_LEAD}${PFX_CAPTURE}(\\d{1,2})([/.])(\\d{1,2})(?:[/.](20\\d{2}|\\d{2}))?${AFTER_NUM}`
);

const MONTH_BY_NAME = new Map(MONTHS.flatMap((mo) => mo.names.map((n) => [n, mo.month] as const)));
const RE_MONTH_NAME = rxg(
  `${DATE_WORD_LEAD}${PFX}(\\d{1,2})\\s+${ATTACHED}(${alt([...MONTH_BY_NAME.keys()])})(?:\\s+(20\\d{2}))?${AFTER}`
);

const OF_MONTH = `\\s+(?:${alt(OF_MONTH_WORDS)})(\\s+הבא)?${AFTER}`;
/** "ה-10", "ביום ה-10 לחודש", "מה-10" (after "לא יאוחר"). Without "לחודש" it needs "עד". */
const RE_DOM_H = rxg(`(מ?)(?:ו?[בל]?יום\\s+)?ה\\s?(\\d{1,2})${AFTER_NUM}(${OF_MONTH})?`);
/** "ב-10 לחודש", "ל-10 לחודש הבא". */
const RE_DOM_B = rxg(`ו?[בל]\\s?(\\d{1,2})${OF_MONTH}`);

interface Period {
  re: RegExp;
  resolve: (today: ISODate) => ISODate;
  flags: Pick<DateHit, 'period' | 'monthTail' | 'week'>;
}

const period = (
  phrases: readonly string[],
  resolve: (today: ISODate) => ISODate,
  flags: Period['flags'] = {}
): Period => ({ re: rxg(`${PFX}(?:${alt(phrases)})${AFTER}`), resolve, flags });

const nextSunday = (today: ISODate): ISODate => nextWeekday(today, 0);

const PERIODS: readonly Period[] = [
  // decision (f): "סוף השבוע" said on Friday is today (the snooze sheet differs; it shows the date)
  period(PERIOD_PHRASES.weekend, (today) => nextWeekdayOnOrAfter(today, 5)),
  period(PERIOD_PHRASES.monthEnd, endOfMonth),
  // M1: "השבוע" follows the week bucket, which on Friday/Saturday runs to NEXT Saturday
  period(PERIOD_PHRASES.thisWeek, weekHorizon, { period: true, week: 'this' }),
  // a week plan ends next week's Saturday; after "עד" it is next Sunday (dateCandidates)
  period(PERIOD_PHRASES.nextWeek, nextSunday, { period: true, week: 'next' }),
  period(PERIOD_PHRASES.nextMonth, startOfNextMonth, { period: true, monthTail: true }),
  period(PERIOD_PHRASES.nextMonthEnd, (today) => endOfMonth(startOfNextMonth(today))),
  period(PERIOD_PHRASES.nextMonthStart, startOfNextMonth),
  period(PERIOD_PHRASES.nextWeekEnd, (today) => addDays(nextSunday(today), 5)),
  period(PERIOD_PHRASES.nextWeekStart, nextSunday),
  period(PERIOD_PHRASES.dayEnd, (today) => today)
];

/** A date with its year written; one further back than the grace days is no date (council M2). */
function explicitYear(
  day: number,
  month: number,
  yearText: string,
  today: ISODate
): ISODate | null {
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  if (!isValidYMD(year, month, day)) return null;
  const iso = toISO(year, month, day);
  return diffDays(iso, today) < -PAST_GRACE_DAYS ? null : iso;
}

const RE_SATURDAY_NIGHT = rxg(`${PFX}(?:${alt(SATURDAY_NIGHT_PHRASES)})${AFTER}`);
const RE_LAMED_DAY = rxg(`ו?ל(${alt(LAMED_DAY_NAMES)})${MODS}${AFTER}`);
/** Between a weekday and its date: "ביום חמישי, 15/10", "ביום חמישי ה-15/10". */
const RE_PAIR_GAP = /^,?\s+(?:ה\s?)?$/u;

function offsetDate(today: ISODate, n: number, unit: OffsetUnit): ISODate | null {
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  if (unit === 'day') return addDays(today, n);
  return unit === 'week' ? addDays(today, 7 * n) : addMonths(today, n);
}

/** Every date-looking phrase, before vetoes and introducers are applied. */
export function collectDateHits(ctx: Ctx): DateHit[] {
  const { text, today } = ctx;
  const out: DateHit[] = [];
  const add = (h: Hit, iso: ISODate | null | undefined, extra: Partial<DateHit> = {}) => {
    if (iso) out.push({ ...extra, start: h.start, end: h.end, iso });
  };
  const onWeekday = (phrase: string, resolve: (index: number) => ISODate) => {
    const index = weekdayIndexOf(phrase);
    return index === undefined ? null : resolve(index);
  };
  const next = (index: number) => nextWeekday(today, index);

  for (const h of scan(RE_REL, text)) {
    const word = group(h.m, 2);
    if (word === 'היום' && group(h.m, 1).includes('מ')) continue; // "מהיום": from now on
    const vetoable = word === 'היום' || word === 'הערב';
    add(h, addDays(today, RELATIVE_DAYS[word] ?? 0), {
      period: vetoable,
      ...(DATE_DAY_PARTS[word] ? { dayPart: DATE_DAY_PARTS[word] } : {})
    });
  }

  for (const h of scan(RE_WD_NEXT_WEEK, text)) {
    add(
      h,
      onWeekday(group(h.m, 1), (i) => addDays(nextSunday(today), i))
    );
  }
  for (const h of scan(RE_NEXT_WEEK_WD, text)) {
    add(
      h,
      onWeekday(group(h.m, 1), (i) => addDays(nextSunday(today), i))
    );
  }
  for (const h of scan(RE_WD_THIS_WEEK, text)) {
    add(
      h,
      onWeekday(group(h.m, 1), (i) => {
        const thisWeek = addDays(startOfWeek(today), i);
        return thisWeek >= today ? thisWeek : next(i);
      })
    );
  }

  for (const h of scan(RE_YOM, text)) add(h, onWeekday(group(h.m, 1), next), { weekday: true });
  for (const h of scan(RE_BET_DAY, text)) {
    add(h, onWeekday(group(h.m, 1), next), { weekday: true, bare: true, strict: !group(h.m, 2) });
  }
  for (const h of scan(RE_BARE_DAY, text)) {
    add(h, onWeekday(group(h.m, 2), next), {
      weekday: true,
      bare: true,
      needs: group(h.m, 1) === 'מ' ? 'notLater' : 'intro'
    });
  }
  for (const h of scan(RE_YOM_FROM, text)) {
    add(h, onWeekday(group(h.m, 1), next), { weekday: true, needs: 'notLater' });
  }
  for (const h of scan(RE_LAMED_DAY, text)) {
    add(h, onWeekday(group(h.m, 1), next), { weekday: true, lamed: true });
  }
  // "במוצ"ש": Saturday evening (tonight, on a Saturday)
  for (const h of scan(RE_SATURDAY_NIGHT, text)) {
    add(h, nextWeekdayOnOrAfter(today, 6), { dayPart: 'evening' });
  }

  for (const p of PERIODS) {
    for (const h of scan(p.re, text)) add(h, p.resolve(today), p.flags);
  }

  for (const h of scan(RE_OFFSET, text)) {
    if (RE_OFFSET_TAIL.test(text.slice(h.end))) continue;
    const count = group(h.m, 1);
    const unitWord = group(h.m, 2);
    if (unitWord) {
      const n = count in NUMBER_WORDS ? NUMBER_WORDS[count] : Number(count);
      const unit = OFFSET_UNITS[unitWord];
      add(h, unit && n !== undefined ? offsetDate(today, n, unit) : null);
    } else {
      const dual = DUAL_UNITS[group(h.m, 3)];
      const single = OFFSET_UNITS[group(h.m, 4)];
      const unit = dual ?? single;
      add(h, unit ? offsetDate(today, dual ? 2 : 1, unit) : null);
    }
  }

  for (const h of scan(RE_NUMERIC, text, true)) {
    const day = Number(group(h.m, 3));
    const monthText = group(h.m, 5);
    const month = Number(monthText);
    const yearText = group(h.m, 6);
    add(
      h,
      yearText
        ? explicitYear(day, month, yearText, today)
        : yearlessDate(month, day, today, PAST_GRACE_DAYS),
      {
        explicit: true,
        numeric: {
          day,
          month,
          sep: group(h.m, 4),
          monthDigits: monthText.length,
          yearful: yearText !== '',
          prefixed: group(h.m, 1) !== '' || /[בלהמ]/.test(group(h.m, 2)),
          bet: group(h.m, 2).includes('ב')
        }
      }
    );
  }

  for (const h of scan(RE_MONTH_NAME, text)) {
    const month = MONTH_BY_NAME.get(group(h.m, 3));
    const day = Number(group(h.m, 2));
    const yearText = group(h.m, 4);
    if (month === undefined) continue;
    add(h, yearText ? explicitYear(day, month, yearText, today) : yearlessDate(month, day, today), {
      explicit: true
    });
  }

  for (const h of scan(RE_DOM_H, text, true)) {
    const ofMonth = group(h.m, 3) !== '';
    const from = group(h.m, 1) === 'מ';
    add(h, dayOfMonthDate(Number(group(h.m, 2)), today, group(h.m, 4) !== ''), {
      // a bare "ה-10" is an ordinal unless "עד" introduces it: "עד ה-10" but not "עד ה-10 ילדים"
      ...(from ? { needs: 'notLater' as const } : ofMonth ? {} : { needs: 'intro' as const }),
      bare: !ofMonth,
      explicit: !from
    });
  }
  for (const h of scan(RE_DOM_B, text)) {
    add(h, dayOfMonthDate(Number(group(h.m, 1)), today, group(h.m, 2) !== ''));
  }
  return [...out, ...weekdayDatePairs(text, out)];
}

/**
 * M1: "ביום חמישי 15/10" is one phrase. When the weekday and the date agree it is that date;
 * when they disagree it is a void phrase (no chip, nothing consumed, its parts not read alone).
 */
function weekdayDatePairs(text: string, hits: readonly DateHit[]): DateHit[] {
  const out: DateHit[] = [];
  for (const w of hits) {
    if (!w.weekday || w.lamed) continue;
    const index = weekdayIndexOf(text.slice(w.start, w.end));
    if (index === undefined) continue;
    for (const e of hits) {
      if (!e.explicit || e.start < w.end || !RE_PAIR_GAP.test(text.slice(w.end, e.start))) continue;
      out.push({
        start: w.start,
        end: e.end,
        iso: e.iso,
        weekday: true,
        ...(w.needs ? { needs: w.needs } : {}),
        ...(weekday(e.iso) === index ? {} : { void: true })
      });
    }
  }
  return out;
}

// ── vetoes ──

const RE_EVERY_BEFORE = rx1(`(?:^|\\s)${ATTACHED}${lit(EVERY_WORD)}\\s+$`);
const NON_TO_PREFIX = `[${PREFIX_LETTERS.replace('ל', '')}]{0,2}`;
/** "סדר היום" is the agenda, but "לסדר היום" is "to tidy up today": סדר may not take ל. */
const RE_MODIFIER_BEFORE = rx1(
  `(?:^|\\s)(?:${ATTACHED}(?:${alt(PERIOD_MODIFIERS.filter((w) => w !== 'סדר'))})|${NON_TO_PREFIX}סדר)\\s+$`
);
const RE_EVE_BEFORE = rx1(`(?:^|\\s)ו?ב?${lit(EVE_WORD)}\\s+$`);
const RE_RANGE_BEFORE = rx1(`(?:^|\\s)(${lit(RANGE_WORD)}\\s+)$`);
const RE_RANGE_JOIN = /^\s+(?:עד\s+)?/u;
const RE_STARTING_BEFORE = rx1(`(?:^|\\s)(${lit(STARTING_WORD)}\\s+)$`);
/** "ה-31 לחודש הבא" that is not a real date must not fall back to "לחודש הבא". */
const RE_NUMBER_BEFORE = /(?:^|\s)\S{0,2}\d{1,2}\s+$/u;
const RE_VETO_NEXT = rx1(`^\\s+(?:${alt(DAY_NAME_VETO_NEXT)})${AFTER}`);
/** After a bare day name: a definite or plural noun ("בשני הילדים", "בשני תשלומים") or "לפני". */
const RE_BARE_VETO_NEXT = rx1(
  `^\\s+(?:ה\\p{L}+|\\p{L}+(?:ים|ות)|(?:${alt(BARE_DAY_VETO_NEXT)})(?!\\s+הצהר))${AFTER}`
);

/** The introducer, then spaces, or an opening bracket or quote before the date: "עד (מחר)". */
const RE_INTRO = rx1(
  `(ו?${lit(UNTIL_WORD)}|${lit(HARD_DEADLINE_PHRASE)}:?|${lit(NOT_LATER_PHRASE)}|ו?${lit(BEFORE_WORD)})` +
    `(?:\\s+|\\s*([([{"\u{5F4}\u{201C}])\\s*)$`
);
/** "(עד מחר)", "״עד מחר״": an opening bracket or quote may precede the introducer. */
const INTRO_LEAD_RE = /[\s([{"'\u{5F3}\u{5F4}\u{201C}\u{201D}\u{2018}\u{2019}]/u;
const CLOSERS: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  '\u{5F4}': '\u{5F4}',
  '\u{201C}': '\u{201D}'
};

interface Intro {
  start: number;
  kind: 'until' | 'hard' | 'notLater' | 'before';
  /** The closing bracket or quote expected right after the date ("עד (מחר)"). */
  closer?: string;
}

/** "עד" / "מועד אחרון" / "לא יאוחר" right before `idx`, with the index where it starts. */
function introBefore(text: string, idx: number): Intro | null {
  const before = lookback(text, idx);
  const m = RE_INTRO.exec(before);
  if (!m) return null;
  if (m.index > 0 && !INTRO_LEAD_RE.test(before.charAt(m.index - 1))) return null;
  const word = group(m, 1);
  const kind = word.startsWith('מועד')
    ? 'hard'
    : word.startsWith('לא')
      ? 'notLater'
      : word.replace(/^ו/, '') === BEFORE_WORD
        ? 'before'
        : 'until';
  const closer = CLOSERS[group(m, 2)];
  return { start: idx - before.length + m.index, kind, ...(closer ? { closer } : {}) };
}

const RE_CONTEXT_BEFORE = lastWordRe(NUMBER_CONTEXT_WORDS, (w) =>
  w.includes("'") ? litStrict(w) : lit(w)
);
const RE_STREET_BEFORE = rx1(
  `(?:^|\\s)${ATTACHED}(?:${alt(STREET_WORDS, (w) => (w.includes("'") ? litStrict(w) : lit(w)))})(?:\\s+[^\\s]+){0,2}\\s+$`
);
const RE_LATIN_BEFORE = /(?:^|\s)[A-Za-z][\w+.]*\s+$/;
const RE_UNIT_AFTER = rx1(`^\\s?(?:${alt(UNIT_WORDS)})${AFTER}`);
const RE_CURRENCY_BEFORE = rx1('[₪$€£]\\s?$');

/** "שבוע לפני", "3 ימים לפני": an offset before "לפני" that the parser does not read. */
const RE_BEFORE_OFFSET = rx1(
  `(?:^|\\s)((?:\\d{1,3}\\s+|(?:${alt(Object.keys(NUMBER_WORDS))})\\s+)?(?:${alt(BEFORE_OFFSET_WORDS)}))\\s+$`
);
const RE_LAMED_VETO_BEFORE = lastWordRe(LAMED_DAY_VETO_BEFORE);
/** "בראשון להתקשר": a leading weekday right before an infinitive. */
const RE_INFINITIVE_NEXT = rx1(`^\\s+ל\\p{L}{3,}${AFTER}`);

/** "החוג של יום שלישי": the date describes a noun (launch audit CON-3). Not "לבשל", "למשל". */
const RE_OF_BEFORE = rx1(`(?:^|\\s)ו?${lit(OF_WORD)}\\s+$`);
/** Quote marks; a geresh or gershayim inside a word ("אחה״צ") never touches a date phrase. */
const QUOTE_RE = /["'\u{5F3}\u{5F4}\u{201C}\u{201D}\u{201E}\u{2018}\u{2019}]/u;

/**
 * "להחזיר את ספר 'היום שאחרי'", 'לקנות ספר "מחר בבוקר"': a date phrase that touches an opening or a
 * closing quote is part of a name or a quotation, not a date (launch audit CON-3).
 */
function quoted(text: string, start: number, end: number): boolean {
  const opens = QUOTE_RE.test(text.charAt(start - 1)) && /^[\s([{]?$/u.test(text.charAt(start - 2));
  const closes = QUOTE_RE.test(text.charAt(end)) && /^[\s)\]}.,;:!?]?$/u.test(text.charAt(end + 1));
  return opens || closes;
}

const RE_CLAUSE_OPENER = rxg(`ו?ש(?:ה\\p{L}+|${alt(SHIN_CLAUSE_PRONOUNS)}|\\p{L}+נו)(?![${LD}])`);
const NOT_OPENERS = new Set([...SHIN_WORDS_NOT_CLAUSE, ...SHIN_POSSESSIVES]);
const RE_CLAUSE_END = /[,;:!?]|\.(?=\s|$)|\sול\p{L}{3,}/u;

/** The spans of the ש-clauses in `text` (SHIN_CLAUSE_PRONOUNS): a date inside one is no date. */
function shinClauses(text: string): Span[] {
  const out: Span[] = [];
  for (const h of scan(RE_CLAUSE_OPENER, text)) {
    if (NOT_OPENERS.has(h.m[0].replace(/^ו/, ''))) continue;
    const end = RE_CLAUSE_END.exec(text.slice(h.end));
    out.push([h.start, end ? h.end + end.index : text.length]);
  }
  return out;
}

/** C1: may this dd/mm hit be a date? `introduced`: by its own prefix, "תאריך", or an introducer. */
function numericOk(ctx: Ctx, h: DateHit, info: NumericInfo, introduced: boolean): boolean {
  const { text } = ctx;
  const before = lookback(text, h.start);
  // (d) a quantity or a price, introduced or not: "1/2 קילו", "₪2.5", "ב-3.5 אלף"
  if (RE_UNIT_AFTER.test(text.slice(h.end, h.end + 12)) || RE_CURRENCY_BEFORE.test(before)) {
    return false;
  }
  // "ב-19.9" is as likely a price: a dotted date after ב only near today (council M2)
  if (
    info.bet &&
    info.sep === '.' &&
    !info.yearful &&
    diffDays(h.iso, ctx.today) > MAX_BET_DOTTED_DAYS_AHEAD
  ) {
    return false;
  }
  if (introduced) return true;
  // (a) an address, size, grade, version...: "דירה 4/12", "iOS 17.1", "רחוב בן גוריון 4/12"
  if (RE_CONTEXT_BEFORE.test(before) || RE_STREET_BEFORE.test(before)) return false;
  if (RE_LATIN_BEFORE.test(before)) return false;
  if (!info.yearful) {
    // (b) a fraction: 1/2, 1/3, 2/3, 1/4, 3/4
    if (info.sep === '/' && info.day < info.month && info.month <= 4) return false;
    // (c) a decimal: 1.5, 2.5, 3.5
    if (info.sep === '.' && info.day <= 9 && info.monthDigits === 1) return false;
    // (e) too far ahead to be what a bare number means
    if (diffDays(h.iso, ctx.today) > MAX_BARE_DATE_DAYS_AHEAD) return false;
  }
  return true;
}

/** Extends a phrase over a part-of-day word right after it ("מחר בבוקר"). */
function withDayPart<T extends { end: number; dayPart?: DayPart }>(text: string, h: T): T {
  const m = DAY_PART_NEXT_RE.exec(text.slice(h.end));
  if (!m) return h;
  const part = partOf(group(m, 1).replace(/^ו/, ''));
  return { ...h, end: h.end + m[0].length, dayPart: h.dayPart ?? part };
}

/** Date and due candidates: the hits that survive every veto, with "עד" turning them into due. */
export function dateCandidates(
  ctx: Ctx,
  hits: readonly DateHit[],
  phraseStarts: ReadonlySet<number>
): Cand[] {
  const { text } = ctx;
  const out: Cand[] = [];
  const longestAt = new Map<number, number>();
  for (const h of hits) longestAt.set(h.start, Math.max(longestAt.get(h.start) ?? 0, h.end));
  const clauses = shinClauses(text);
  for (const hit of hits) {
    const before = lookback(text, hit.start);
    const rest = text.slice(hit.end);
    if (RE_EVERY_BEFORE.test(before)) continue; // "כל השבוע", "כל יום שני וחמישי"
    if (RE_OF_BEFORE.test(before)) continue; // "החוג של יום שלישי"
    const intro = introBefore(text, hit.start);
    // "שהזמנו ביום ראשון" is no date, but "שקנינו עד יום חמישי" / "שעובד לפני שבת" is a deadline
    if (!intro && clauses.some(([s, e]) => hit.start >= s && hit.start < e)) continue;
    if (hit.period && RE_MODIFIER_BEFORE.test(before)) continue; // "סדר היום", "באמצע השבוע"
    if (hit.monthTail && RE_NUMBER_BEFORE.test(before)) continue;
    if (hit.weekday && (RE_EVE_BEFORE.test(before) || RE_VETO_NEXT.test(rest))) continue;
    // "בראשון להתקשר לבנק": a weekday leading the line before an infinitive
    const leadsInfinitive =
      hit.strict === true && separatedBefore(ctx, hit.start) && RE_INFINITIVE_NEXT.test(rest);
    if (hit.bare && !leadsInfinitive && RE_BARE_VETO_NEXT.test(rest)) continue; // "בשני הילדים"
    const h = withDayPart(text, hit);
    if (hit.strict && h === hit && !leadsInfinitive && !followerOk(ctx, hit.end, phraseStarts)) {
      continue;
    }
    if (hit.lamed) {
      // "להכין עוגה לשבת" but not "מקום לשבת" or "לשבת עם דני"
      if (RE_LAMED_VETO_BEFORE.test(before)) continue;
      if (h === hit && !followerOk(ctx, hit.end, phraseStarts)) continue;
    }

    if (!intro && quoted(text, hit.start, h.end)) continue; // 'לקנות ספר "מחר בבוקר"'
    if (hit.needs === 'intro' && !intro) continue;
    if (hit.needs === 'notLater' && intro?.kind !== 'notLater') continue;
    if (hit.numeric && !numericOk(ctx, hit, hit.numeric, hit.numeric.prefixed || intro !== null)) {
      continue;
    }
    const dayPart = h.dayPart ? { dayPart: h.dayPart } : {};
    if (intro) {
      // "עד (מחר)": the closing bracket goes with the phrase
      const end = intro.closer && text.startsWith(intro.closer, h.end) ? h.end + 1 : h.end;
      if (intro.kind === 'before') {
        // "שבוע לפני 15/10": the offset is not read, so the whole phrase is no date
        const before2 = lookback(text, intro.start);
        const off = RE_BEFORE_OFFSET.exec(before2);
        if (off) {
          const offStart = intro.start - before2.length + off.index + off[0].indexOf(group(off, 1));
          out.push({ kind: 'due', start: offStart, end, void: true });
          continue;
        }
      }
      if (hit.void) {
        out.push({ kind: 'due', start: intro.start, end, void: true });
        continue;
      }
      const kind = intro.kind === 'hard' ? 'hard' : 'until';
      // "לפני יום שישי" is due the day before (council M3)
      const iso = intro.kind === 'before' ? addDays(h.iso, -1) : h.iso;
      out.push({ kind: 'due', start: intro.start, end, iso, intro: kind, ...dayPart });
      continue;
    }
    if (hit.void) {
      out.push({ kind: 'date', start: h.start, end: h.end, void: true });
      continue;
    }
    if (hit.week) {
      // a week plan: "השבוע" ends weekHorizon(today), "בשבוע הבא" ends next week's Saturday
      const iso = hit.week === 'next' ? addDays(h.iso, 6) : h.iso;
      out.push({ kind: 'date', start: h.start, end: h.end, iso, week: hit.week, ...dayPart });
      continue;
    }
    let { start, end } = h;
    // "בין 15/10 ל-20/10": one phrase, the first date
    const range = RE_RANGE_BEFORE.exec(before);
    const join = RE_RANGE_JOIN.exec(text.slice(h.end));
    const second = longestAt.get(h.end + (join?.[0].length ?? 0));
    if (range && join && second !== undefined) {
      start -= group(range, 1).length;
      end = second;
    }
    // "החל מ-1/11", "החל ממחר"
    const starting = RE_STARTING_BEFORE.exec(before);
    if (starting && text.charAt(h.start) === 'מ') start -= group(starting, 1).length;
    // "לקנות חלות לשבת": what is for Shabbat gets done before it, so it is planned for the Friday.
    // With a part of day or a time after it ("לשבת בבוקר", "לשבת ב-12:00") it is Shabbat itself.
    const forShabbat =
      hit.lamed === true && h === hit && weekday(h.iso) === 6 && !phraseStarts.has(h.end + 1);
    const iso = forShabbat ? addDays(h.iso, -1) : h.iso;
    out.push({ kind: 'date', start, end, iso, ...dayPart });
  }
  return out;
}

// ── M4: a day word the line names without a date chip ──

const RE_DAY_WORD = anywhereRe([
  ...DAY_LIKE_WORDS,
  // "מחר" left in the title (inside a ש-clause, a quotation, after של): never imply today
  ...Object.keys(RELATIVE_DAYS).filter((w) => (RELATIVE_DAYS[w] ?? 0) > 0),
  ...DAY_ENTRIES.map(([n]) => n),
  ...MONTHS.flatMap((mo) => mo.names)
]);

/**
 * True when the text outside the `consumed` spans names a day, a holiday, a month or a later
 * relative day ("ארוחת שישי", "ארוחת חג", "באוקטובר", "שהמליצו עליו מחר"): a lone time then implies
 * no date (council M4).
 */
export function namesUnparsedDay(text: string, consumed: readonly Span[]): boolean {
  let rest = text;
  for (const [s, e] of consumed) rest = rest.slice(0, s) + ' '.repeat(e - s) + rest.slice(e);
  return RE_DAY_WORD.test(rest);
}

// ───────────────────────────── "מועד אחרון" on its own ─────────────────────────────

const RE_HARD = rxg(`${PFX}${lit(HARD_DEADLINE_PHRASE)}${AFTER}`);

export function hardCandidates(text: string): Cand[] {
  return scan(RE_HARD, text).map((h) => ({ kind: 'hard', start: h.start, end: h.end }));
}

// ───────────────────────────── times ─────────────────────────────

interface TimeHit {
  start: number;
  end: number;
  clock: ClockParts;
  /** A bare H:MM with no ב / בשעה / עד: a score or a duration vetoes it. */
  bareColon?: boolean;
  /** A range of bare numbers ("בין 10 ל-12"): needs a clean ending like a C2 day name. */
  needsFollower?: boolean;
  /** The end of a range ("בין 8 ל-12"). */
  endClock?: ClockParts;
  /** "מחר ב-4": a bare number after ב, a time only right after a date and not before a noun. */
  afterDate?: boolean;
}

const DP_LEAD = `(?:(${DAY_PART_ALT})\\s+)?`;
const DP_TRAIL = `(?:\\s+(${DAY_PART_ALT})${AFTER})?`;
const UNTIL_OPT = `(ו?${lit(UNTIL_WORD)}\\s+|${lit(NOT_LATER_PHRASE)}\\s+מ\\s?)?`;
const HALF = `(?:\\s+ו(${alt(Object.keys(MINUTE_WORDS))})${AFTER})?`;
const HOUR_LEAD = `${ATTACHED}${lit(HOUR_WORD)}`;

// "ב-17:00", "בשעה 17:30", "עד 17:00", "בבוקר בשעה 7:30", "ל-20:00 בערב", or a bare "17:30"
const RE_TIME_COLON = rxg(
  `${DP_LEAD}${UNTIL_OPT}(?:(${HOUR_LEAD})\\s+|(ו?[בל])\\s?)?(\\d{1,2}):(\\d{2})${AFTER_NUM}${DP_TRAIL}`
);
// "בשעה 5", "בשעה 17.30", "בשעה 5 וחצי": needs the word שעה so a bare number is never a time
const RE_TIME_HOUR = rxg(
  `${DP_LEAD}${UNTIL_OPT}(${HOUR_LEAD})\\s+(\\d{1,2})(?:\\.(\\d{2}))?${AFTER_NUM}${HALF}${DP_TRAIL}`
);
// "ב-8 בבוקר", "בערב ב-8": a bare number after ב needs a part-of-day word
const RE_TIME_BET = rxg(`${DP_LEAD}${UNTIL_OPT}ו?[בל]\\s?(\\d{1,2})${AFTER_NUM}${HALF}${DP_TRAIL}`);
// "בין 10:00 ל-12:00", "בין השעות 10 ל-12", "מ-10:00 עד 12:00", "10:00-12:00": the start time
const T = `(\\d{1,2})(?::(\\d{2}))?`;
const RE_TIME_RANGE = rxg(
  `(?:(${lit(BETWEEN_WORD)})\\s+(?:${ATTACHED}${lit(HOURS_WORD)}\\s+)?|(מ)\\s?|(${ATTACHED}${lit(HOURS_WORD)})\\s+|(ו?ב)\\s?)?` +
    `${T}\\s+(?:${lit(UNTIL_WORD)}\\s+|ו?ל\\s?)?${T}${AFTER_NUM}${DP_TRAIL}`
);

const RE_SCORE_BEFORE = lastWordRe(SCORE_WORDS);
/** "בשעה 5 ו-10 דקות": more minutes than the phrase captured; better no time than 17:00. */
const RE_MORE_MINUTES_AFTER = /^\s+ו\s?\d/u;
const RE_DURATION_AFTER = rx1(`^\\s+(?:${alt(DURATION_WORDS)})${AFTER}`);
/** "מחר ב-3 קבוצות", "ב-5 שקלים": a plural noun or a unit after the number is a quantity. */
const RE_QUANTITY_AFTER = rx1(
  `^\\s+(?:\\p{L}+(?:ים|ות)|${alt([...UNIT_WORDS, ...DURATION_WORDS])})${AFTER}`
);
const TIME_CUE_RES = {
  am: anywhereRe(TIME_CUES.am),
  pm: anywhereRe(TIME_CUES.pm)
};

/** A word in the line that settles an ambiguous 6 or 7 (council C1); none, or both, is undefined. */
export function timeCue(text: string): 'am' | 'pm' | undefined {
  const am = TIME_CUE_RES.am.test(text);
  const pm = TIME_CUE_RES.pm.test(text);
  return am === pm ? undefined : am ? 'am' : 'pm';
}

function makeClock(
  hourText: string,
  minuteText: string,
  extraMinutes: string,
  partWord: string
): ClockParts | null {
  const hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : (MINUTE_WORDS[extraMinutes] ?? 0);
  if (hour > 23 || minute > 59) return null;
  const dayPart = partWord ? partOf(partWord) : undefined;
  return {
    hour,
    minute,
    padded: hourText.length === 2 && hourText.startsWith('0'),
    ...(dayPart ? { dayPart } : {})
  };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

function applyDayPart(hour: number, part: DayPart): number {
  switch (part) {
    case 'morning':
      return hour;
    case 'noon':
      return hour >= 1 && hour <= 5 ? hour + 12 : hour; // "1 בצהריים" = 13:00, "12 בצהריים" = 12:00
    case 'night':
      if (hour === 12) return 0;
      return hour >= 6 && hour <= 11 ? hour + 12 : hour; // "11 בלילה" = 23:00, "3 בלילה" = 03:00
    default:
      return hour >= 1 && hour <= 11 ? hour + 12 : hour; // afternoon, evening
  }
}

/**
 * 'HH:mm' for a clock as written, or null when it is ambiguous. Its own part-of-day word wins, then
 * the part of day of the date it goes with ("מחר בבוקר בשעה 7"). With neither (council C1):
 * - an unpadded hour 1–5 is afternoon ("בשעה 5" and "5:30" are 17:00 / 17:30);
 * - an unpadded 6 or 7 needs a cue in the line (`cue`: להעיר / טיסה … = AM, ארוחת ערב … = PM),
 *   else it is ambiguous (null: no time chip);
 * - a zero-padded hour ("05:30", "07:30") is literal.
 */
export function resolveClock(c: ClockParts, fallback?: DayPart, cue?: 'am' | 'pm'): string | null {
  let hour = c.hour;
  const part = c.dayPart ?? fallback;
  if (part) {
    if (hour <= 12) hour = applyDayPart(hour, part);
  } else if (!c.padded && hour >= 1 && hour <= PM_UNTIL_HOUR) {
    hour += 12;
  } else if (!c.padded && AMBIGUOUS_HOURS.includes(hour)) {
    if (!cue) return null;
    if (cue === 'pm') hour += 12;
  }
  return `${pad2(hour)}:${pad2(c.minute)}`;
}

/**
 * The end of a range, resolved with the same part of day and cue as its start, never before the
 * start: "בין 10 ל-2" ends 14:00, "בין 4 ל-6 אחה"צ" 18:00, "בין 5 ל-7" 19:00.
 */
export function resolveRangeEnd(
  end: ClockParts,
  start: string,
  fallback?: DayPart,
  cue?: 'am' | 'pm'
): string {
  const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  const at = (h: number) => h * 60 + end.minute;
  const resolved = resolveClock(end, fallback, cue);
  let hour = resolved ? Number(resolved.slice(0, 2)) : end.hour;
  if (at(hour) < startMinutes && hour + 12 <= 23 && !end.padded) hour += 12;
  return `${pad2(hour)}:${pad2(end.minute)}`;
}

/** Every time-looking phrase, before vetoes. */
export function collectTimeHits(text: string): TimeHit[] {
  const out: TimeHit[] = [];
  const add = (h: Hit, clock: ClockParts | null, extra: Partial<TimeHit> = {}) => {
    if (clock) out.push({ ...extra, start: h.start, end: h.end, clock });
  };
  for (const h of scan(RE_TIME_COLON, text, true)) {
    const lead = group(h.m, 1);
    const intro = lead || group(h.m, 2) || group(h.m, 3) || group(h.m, 4);
    add(h, makeClock(group(h.m, 5), group(h.m, 6), '', group(h.m, 7) || lead), {
      bareColon: !intro
    });
  }
  for (const h of scan(RE_TIME_HOUR, text, true)) {
    const lead = group(h.m, 1);
    add(h, makeClock(group(h.m, 4), group(h.m, 5), group(h.m, 6), group(h.m, 7) || lead));
  }
  for (const h of scan(RE_TIME_BET, text, true)) {
    const part = group(h.m, 5) || group(h.m, 1);
    add(h, makeClock(group(h.m, 3), '', group(h.m, 4), part), part ? {} : { afterDate: true });
  }
  for (const h of scan(RE_TIME_RANGE, text, true)) {
    const [between, from, hours, bet] = [1, 2, 3, 4].map((i) => group(h.m, i));
    const [m1, m2] = [group(h.m, 6), group(h.m, 8)];
    const part = group(h.m, 9);
    const end = makeClock(group(h.m, 7), m2, '', part);
    if (!end) continue;
    const colons = Number(m1 !== '') + Number(m2 !== '');
    // without בין / שעות, both ends need minutes ("10:00-12:00"); "מ-10 עד 12" needs at least one
    if (!between && !hours && colons < (from ? 1 : 2)) continue;
    if (bet && colons < 2) continue;
    add(h, makeClock(group(h.m, 5), m1, '', part), {
      needsFollower: colons === 0 && !part,
      endClock: end
    });
  }
  return out;
}

/** Time candidates: the hits that survive the score / duration / follower vetoes. */
export function timeCandidates(
  ctx: Ctx,
  hits: readonly TimeHit[],
  phraseStarts: ReadonlySet<number>,
  dateEnds: ReadonlySet<number>
): Cand[] {
  const { text } = ctx;
  const out: Cand[] = [];
  for (const h of hits) {
    if (RE_MORE_MINUTES_AFTER.test(text.slice(h.end))) continue;
    if (h.bareColon) {
      if (RE_SCORE_BEFORE.test(lookback(text, h.start))) continue; // "ניצחנו 3:10"
      if (RE_DURATION_AFTER.test(text.slice(h.end))) continue; // "1:30 שעות"
    }
    // "בין 2 ל-3 ילדים" is not a time, but "מחר בין 10 ל-12 טכנאי" is
    if (h.needsFollower && !dateEnds.has(h.start - 1) && !followerOk(ctx, h.end, phraseStarts)) {
      continue;
    }
    // "מחר ב-4 להתקשר" is a time; "מחר ב-3 קבוצות" and a bare "ב-4" alone are not
    if (h.afterDate && (!dateEnds.has(h.start - 1) || RE_QUANTITY_AFTER.test(text.slice(h.end)))) {
      continue;
    }
    out.push({
      kind: 'time',
      start: h.start,
      end: h.end,
      clock: h.clock,
      ...(h.endClock ? { endClock: h.endClock } : {})
    });
  }
  return out;
}

// ───────────────────────────── priority ─────────────────────────────

export const LEVEL_RANK = { high: 1, urgent: 2 } as const;
const PRIORITY_LEVEL = new Map(
  PRIORITY_WORDS.flatMap((p) => p.words.map((w) => [w, p.priority] as const))
);
/** "דחוףףף": a priority word may be stretched by repeating its last letter. */
const PRIORITY_WORD_ALT = alt([...PRIORITY_LEVEL.keys()], (w) => `${lit(w)}+`);
const levelOf = (word: string) => PRIORITY_LEVEL.get(word.replace(/(\p{L})\1+$/u, '$1'));
const PRIORITY_PFX = `[${PRIORITY_PREFIX_LETTERS}]{0,2}`;
const INTENS_BEFORE = `(?:(?:${alt(INTENSIFIERS_BEFORE)})\\s+){0,2}`;
const INTENS_AFTER = `(?:\\s+(?:${alt(INTENSIFIERS_AFTER)})${AFTER}){0,2}`;
// "ממש דחוף", "חשוב מאוד", "זה חשוב", "דחוף ביותר": the intensifiers go with the word
const RE_PRIORITY = rxg(
  `${INTENS_BEFORE}${PRIORITY_PFX}(${PRIORITY_WORD_ALT})${AFTER}${INTENS_AFTER}`
);
const RE_NOT_BEFORE = rx1(`(?:^|\\s)${lit(NEGATION_WORD)}\\s+${INTENS_BEFORE}$`);
const RE_NEGATED_WORD_BEFORE = rx1(
  `(?:^|\\s)${lit(NEGATION_WORD)}\\s+${INTENS_BEFORE}${PRIORITY_PFX}(?:${PRIORITY_WORD_ALT})${INTENS_AFTER}\\s*$`
);
const POS_WORD = `${INTENS_BEFORE}${PRIORITY_PFX}(${PRIORITY_WORD_ALT})${AFTER}${INTENS_AFTER}`;
const NEG_WORD = `${lit(NEGATION_WORD)}\\s+${INTENS_BEFORE}${PRIORITY_PFX}(?:${PRIORITY_WORD_ALT})${AFTER}${INTENS_AFTER}`;
const CONTRAST = `,?\\s+(?:${alt(CONTRAST_WORDS)})\\s+`;
// "לא דחוף אבל חשוב", "חשוב אך לא דחוף": one phrase, the level of the word that is not negated
const RE_CONTRAST = rxg(`(?:${NEG_WORD}${CONTRAST}${POS_WORD}|${POS_WORD}${CONTRAST}${NEG_WORD})`);
/** "אם דחוף, להתקשר": a condition. */
const RE_CONDITION_BEFORE = rx1(`(?:^|\\s)ו?${lit(CONDITION_WORD)}\\s+${INTENS_BEFORE}$`);
/** "חשוב לי שהילדים…": the word heads a ש-clause. */
const RE_SHIN_NEXT = rx1(`^\\s+(ש\\p{L}*)`);
const SHIN_OK = new Set(SHIN_WORDS_NOT_CLAUSE);
const RE_BANGS = /!+/g;
const MAX_BANGS = 1000;

interface Marker {
  start: number;
  end: number;
  /** null: a single "!" that only rides along with an adjacent priority word (decision b). */
  level: Exclude<Priority, 'normal'> | null;
}

const rank = (level: Marker['level']): number => (level ? LEVEL_RANK[level] : 0);

export function priorityCandidates(text: string): Cand[] {
  const markers: Marker[] = [];
  for (const h of scan(RE_PRIORITY, text)) {
    const before = lookback(text, h.start);
    if (RE_NOT_BEFORE.test(before)) continue; // "לא דחוף", "לא ממש דחוף"
    if (RE_CONDITION_BEFORE.test(before)) continue; // "אם דחוף"
    const shin = RE_SHIN_NEXT.exec(text.slice(h.end));
    if (shin && !SHIN_OK.has(group(shin, 1))) continue; // "חשוב לי שהילדים יאכלו"
    const level = levelOf(group(h.m, 1));
    if (level) markers.push({ start: h.start, end: h.end, level });
  }
  for (const h of scan(RE_CONTRAST, text)) {
    const level = levelOf(group(h.m, 1) || group(h.m, 2));
    if (level) markers.push({ start: h.start, end: h.end, level });
  }
  // punctuation alone is never a priority: "!!" as the whole line is nothing
  const hasWords = WORD_CHAR_RE.test(text);
  RE_BANGS.lastIndex = 0;
  for (let n = 0; n < MAX_BANGS; n++) {
    const m = RE_BANGS.exec(text);
    if (!m) break;
    const start = m.index;
    const end = start + m[0].length;
    if (text.charAt(start - 1) === '?' || text.charAt(end) === '?') continue; // "?!" is a question
    if (!hasWords) continue;
    if (RE_NEGATED_WORD_BEFORE.test(lookback(text, start))) continue; // "לא דחוף!"
    // "!!" is emphasis: at most high, never urgent on its own (council)
    markers.push({ start, end, level: m[0].length >= 2 ? 'high' : null });
  }
  markers.sort((a, b) => a.start - b.start || b.end - a.end);

  // "!! דחוף", "דחוף!" and "ממש דחוף" are one phrase: merge markers that overlap or touch
  const out: Cand[] = [];
  let current: Marker | undefined;
  const flush = () => {
    if (current?.level) {
      out.push({
        kind: 'priority',
        start: current.start,
        end: current.end,
        priority: current.level
      });
    }
  };
  for (const mk of markers) {
    if (current && /^\s*$/.test(text.slice(current.end, mk.start))) {
      current.end = Math.max(current.end, mk.end);
      if (rank(mk.level) > rank(current.level)) current.level = mk.level;
    } else {
      flush();
      current = { ...mk };
    }
  }
  flush();
  return out;
}

// ───────────────────────────── recurrence ─────────────────────────────

const freqs = (Object.keys(RECURRENCE_PHRASES) as RecurrenceFreq[]).filter(
  (f) => RECURRENCE_PHRASES[f].length > 0 // an empty alternation would match the empty string
);
const RECURRENCE_PHRASE_RES = freqs.map((freq) => ({
  freq,
  re: rxg(`${PFX}(?:${alt(RECURRENCE_PHRASES[freq])})${AFTER}`)
}));
const RECURRENCE_ADJECTIVE_RES = (Object.keys(RECURRENCE_ADJECTIVES) as RecurrenceFreq[]).map(
  (freq) => ({
    freq,
    re: rxg(`${PFX}(?:(${lit(ADVERB_LEAD)})\\s+)?(?:${alt(RECURRENCE_ADJECTIVES[freq])})${AFTER}`)
  })
);
/**
 * A weekday letter in a recurrence ("כל יום ה'", "בימים א' וד'"): with a geresh, or alone and NOT
 * before a number. Stricter than WD_LETTER: "כל יום ב-17:00" is every day at 17:00, not Mondays.
 */
const REC_LETTER = `[${LETTERS}](?:${GERESH_CLASS}|(?![${LD}])(?!\\s?\\d))`;
/** "כל יום שלישי", "בכל שבת": weekly from the next such day. Not "כל שני וחמישי" (two days). */
const RE_EVERY_DAY = rxg(
  `${ATTACHED}${lit(EVERY_WORD)}\\s+(?:(יום\\s+(?:${DAY_NAME_ALT}|${REC_LETTER}))|(${DAY_NAME_ALT}))${AFTER}` +
    `(?!\\s+ו(?:יום\\s+|ב)?(?:${DAY_NAME_ALT})${AFTER})` +
    `(?!\\s+(?:${alt(DAY_NAME_VETO_NEXT)})${AFTER})` // "כל יום ראשון לחודש" is monthly, on the 1st
);

/** "כל יום", "פעם ביום", but not "כל יום שלישי" / "כל יום ה'" / "כל יום הולדת". */
const RE_DAILY = rxg(
  `${PFX}(?:${alt(DAILY_PHRASES)})${AFTER}` +
    `(?!\\s+(?:(?:${DAY_NAME_ALT})${AFTER}|${REC_LETTER}|(?:${alt(DAILY_VETO_NEXT)})${AFTER}))`
);

/** A count 1-99: digits or a spelled-out number ("שלושה"). */
const COUNT = `(\\d{1,2}|${alt(Object.keys(NUMBER_WORDS))})`;
/** "כל 3 ימים", "כל שלושה שבועות", "כל יומיים", "פעם בשבועיים", "פעם ב-3 חודשים". */
const RE_INTERVAL = rxg(
  `${PFX}(?:${lit(EVERY_WORD)}\\s+|${lit(ONCE_WORD)}\\s+ב\\s?)` +
    `(?:${COUNT}\\s+(${alt(Object.keys(INTERVAL_UNITS))})|(${alt(Object.keys(INTERVAL_DUALS))}))${AFTER}`
);

/** One day in a list: "שני", "יום שני", "ה'", "יום ה'". Group 1: the name; group 2: the letter. */
const LIST_DAY = `(?:יום\\s+)?(?:(${DAY_NAME_ALT})${AFTER}|([${LETTERS}])(?:${GERESH_CLASS}|(?![${LD}])(?!\\s?\\d)))`;
const LIST_DAY_NC = LIST_DAY.replace(/\((?!\?)/g, '(?:');
/** Between days: a comma (and maybe ו), or ו attached or after a hyphen ("ו-חמישי"), even "וב". */
const LIST_SEP = `(?:\\s*,\\s*(?:ו\\s?)?|\\s+ו(?:ב\\s?)?\\s?)`;
const DAY_AT = new RegExp(LIST_DAY, 'uy');
const SEP_AT = new RegExp(LIST_SEP, 'uy');
/** "כל שבוע" / "כל שבועיים" / "כל 3 שבועות" right before a "בימי …" list: its interval. */
const WEEKS_LEAD = `(?:${PFX}${lit(EVERY_WORD)}\\s+(?:(שבוע|שבועיים)|${COUNT}\\s+שבועות)\\s*,?\\s+)`;
const TIMES_LEAD = `(?:(?:${alt(TIMES_A_WEEK)})\\s*,?\\s+)`;
/** "כל שני וחמישי", "כל יום א' וה'", "כל ראשון, שלישי וחמישי": two or more days after "כל". */
const RE_EVERY_DAYS = rxg(
  `${ATTACHED}${lit(EVERY_WORD)}\\s+(${LIST_DAY_NC}(?:${LIST_SEP}${LIST_DAY_NC})+)`
);
/**
 * "בימי שני וחמישי", "בימים א' וד'", "בימי שלישי" (one day is fine here: "on Tuesdays"), with an
 * optional interval lead ("כל שבועיים בימי שני") or count lead ("פעמיים בשבוע בימים א' וד'").
 */
const RE_DAYS_OF = rxg(
  `${WEEKS_LEAD}?${TIMES_LEAD}?${ATTACHED}(?:${lit(EVERY_WORD)}\\s+)?(?:${alt(DAYS_OF_WORDS)})\\s+` +
    `(${LIST_DAY_NC}(?:${LIST_SEP}${LIST_DAY_NC})*)`
);
/** After a list of days: "לחודש" / "לציון", or a partitive "מהם" ("כל שני ושלישי מהם"). */
const RE_LIST_VETO_NEXT = rx1(`^\\s+(?:${alt(DAY_NAME_VETO_NEXT)}|מה\\p{L}*)${AFTER}`);

/** The weekday indices of a list matched by LIST_DAY (LIST_SEP LIST_DAY)*, in order; null if off. */
function listDays(list: string): number[] | null {
  const days: number[] = [];
  let p = 0;
  while (p < list.length) {
    if (days.length > 0) {
      SEP_AT.lastIndex = p;
      const sep = SEP_AT.exec(list);
      if (!sep) return null;
      p += sep[0].length;
    }
    DAY_AT.lastIndex = p;
    const m = DAY_AT.exec(list);
    if (!m) return null;
    const index = m[1] ? DAY_BY_NAME.get(m[1]) : DAY_BY_LETTER.get(group(m, 2));
    if (index === undefined) return null;
    days.push(index);
    p += m[0].length;
  }
  return days;
}

/** A count written as digits or as a word ("שלושה"), or NaN. */
const countOf = (word: string): number =>
  /^\d+$/.test(word) ? Number(word) : (NUMBER_WORDS[word] ?? Number.NaN);
const okInterval = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= MAX_INTERVAL;

/**
 * A weekly candidate for a list of `days`: one day is a plain weekly repeat from the next such day
 * (as "כל יום שלישי"); several are a weekly rule with those days, from the first one after today.
 */
function daysCand(
  h: Pick<Cand, 'start' | 'end' | 'dayPart'>,
  days: readonly number[],
  interval: number,
  today: ISODate
): Cand {
  const unique = [...new Set(days)].sort((a, b) => a - b);
  const every = interval > 1 ? { interval } : {};
  if (unique.length === 1) {
    const iso = nextWeekday(today, unique[0] as number);
    return { ...h, kind: 'recurrence', freq: 'weekly', ...every, iso };
  }
  const rule = { freq: 'weekly' as const, weekdays: unique };
  return {
    ...h,
    kind: 'recurrence',
    freq: 'weekly',
    ...every,
    weekdays: unique,
    iso: firstPlanDate(rule, today) ?? undefined
  };
}

export function recurrenceCandidates(ctx: Ctx, phraseStarts: ReadonlySet<number>): Cand[] {
  const { text, today } = ctx;
  const out: Cand[] = [];
  for (const { freq, re } of RECURRENCE_PHRASE_RES) {
    for (const h of scan(re, text))
      out.push({ kind: 'recurrence', start: h.start, end: h.end, freq });
  }
  for (const { freq, re } of RECURRENCE_ADJECTIVE_RES) {
    for (const h of scan(re, text)) {
      // "מנוי שנתי" is an annual subscription; "שנתי: לחדש ביטוח" and "…, שבועי" are recurrences
      if (!group(h.m, 1) && !separatedBefore(ctx, h.start)) continue;
      out.push({
        kind: 'recurrence',
        start: h.start,
        end: h.end,
        freq,
        ...(freq === 'daily' ? { iso: today } : {})
      });
    }
  }
  for (const hit of scan(RE_EVERY_DAY, text)) {
    const bare = group(hit.m, 2);
    const index = weekdayIndexOf(bare || group(hit.m, 1));
    const h = withDayPart(text, { start: hit.start, end: hit.end } as Cand);
    if (index === undefined) continue;
    if (bare && h.end === hit.end && !followerOk(ctx, hit.end, phraseStarts)) continue;
    out.push({ ...h, kind: 'recurrence', freq: 'weekly', iso: nextWeekday(today, index) });
  }
  // every day: planned today (quickAdd moves it to tomorrow when its time of day has passed)
  for (const hit of scan(RE_DAILY, text)) {
    const h = withDayPart(text, { start: hit.start, end: hit.end } as Cand);
    out.push({ ...h, kind: 'recurrence', freq: 'daily', iso: today });
  }
  for (const hit of scan(RE_INTERVAL, text)) {
    const dual = group(hit.m, 3);
    const freq = dual ? INTERVAL_DUALS[dual] : INTERVAL_UNITS[group(hit.m, 2)];
    const interval = dual ? 2 : countOf(group(hit.m, 1));
    if (!freq || !okInterval(interval)) continue;
    const every = interval > 1 ? { interval } : {};
    if (freq === 'daily') {
      const h = withDayPart(text, { start: hit.start, end: hit.end } as Cand);
      out.push({ ...h, kind: 'recurrence', freq, ...every, iso: today });
    } else out.push({ kind: 'recurrence', start: hit.start, end: hit.end, freq, ...every });
  }
  for (const hit of scan(RE_EVERY_DAYS, text)) {
    const days = listDays(group(hit.m, 1));
    if (!days || days.length < 2 || RE_LIST_VETO_NEXT.test(text.slice(hit.end))) continue;
    const h = withDayPart(text, { start: hit.start, end: hit.end } as Cand);
    out.push(daysCand(h, days, 1, today));
  }
  for (const hit of scan(RE_DAYS_OF, text)) {
    const days = listDays(group(hit.m, 3));
    if (!days || RE_LIST_VETO_NEXT.test(text.slice(hit.end))) continue;
    const weeks = group(hit.m, 1) || group(hit.m, 2);
    const interval =
      weeks === '' || weeks === 'שבוע' ? 1 : weeks === 'שבועיים' ? 2 : countOf(weeks);
    if (!okInterval(interval)) continue;
    const h = withDayPart(text, { start: hit.start, end: hit.end } as Cand);
    out.push(daysCand(h, days, interval, today));
  }
  return out;
}
