// HomeCare Hebrew quick-add parser (Blueprint §6).
//
// Turns free text such as "להחזיר מכנסיים עד יום חמישי" into a clean title plus optional structured
// fields. Local, deterministic, never throws; if nothing is recognised the input is the title.
//
// Pipeline
//   1. normalise: NFC, drop niqqud, treat maqaf / hyphens / bidi marks as spaces, collapse whitespace, keeping
//      a per-character map back to offsets in the ORIGINAL input;
//   2. find candidates (dates, "עד" deadlines, times, priority, recurrence) with one regex per
//      lexicon entry. Each candidate must start and end on a word boundary;
//   3. resolve overlaps (earliest start wins, then the longest), take at most one candidate per field
//      (the leftmost; priority takes the highest level) and leave every other phrase in the title;
//   4. detect the category (keywords stay in the title);
//   5. rebuild the title from the original input minus the consumed phrases and tidy it.
//
// No owner/member parsing: the app never infers who does a task.

import type { CategoryId, ISODate, Priority, RecurrenceFreq } from '../domain/types';
import {
  addDays,
  addMonths,
  DEFAULT_TZ,
  endOfMonth,
  endOfWeek,
  isValidYMD,
  nextOccurrence,
  nextWeekdayAfter,
  nextWeekdayOnOrAfter,
  startOfNextMonth,
  todayInTz,
  toISO
} from './dateMath';
import {
  AFTERNOON_BEFORE_HOUR,
  alt,
  CATEGORY_KEYWORDS,
  DUAL_UNITS,
  EVERY_WORD,
  GERESH_CLASS,
  HARD_DEADLINE_PHRASE,
  HOUR_WORD,
  IN_WORD,
  lit,
  MAX_PREFIXES,
  MONTHS,
  NEGATION_WORD,
  NUMBER_WORDS,
  OFFSET_UNITS,
  ONE_WORDS,
  PERIOD_PHRASES,
  PREFIX_LETTERS,
  PRIORITY_PREFIX_LETTERS,
  PRIORITY_WORDS,
  RECURRENCE_WORDS,
  RELATIVE_DAYS,
  UNIT_WORDS,
  UNTIL_WORD,
  UPCOMING_WORDS,
  WEEKDAYS,
  type OffsetUnit
} from './lexicon';

// ───────────────────────────── public contract (Blueprint §6) ─────────────────────────────

export interface ParseResult {
  title: string; // input minus consumed phrases, whitespace/punctuation tidied; never empty (falls back to raw)
  scheduledFor?: ISODate;
  dueDate?: ISODate;
  dueTime?: string;
  hardDeadline?: boolean;
  priority?: Priority;
  categoryId?: CategoryId;
  recurrence?: { freq: RecurrenceFreq };
  matches: {
    kind: 'date' | 'due' | 'time' | 'priority' | 'category' | 'recurrence';
    start: number;
    end: number;
    text: string;
  }[];
}

/** One recognised phrase. `start`/`end` are UTF-16 offsets into the ORIGINAL input. */
export type ParseMatch = ParseResult['matches'][number];
export type MatchKind = ParseMatch['kind'];

/**
 * Parses `input` (a quick-add line) relative to `now` in `tz`. Never throws.
 *
 * Ambiguities, resolved deterministically (all covered by tests):
 * - A named weekday is the next occurrence STRICTLY after today ("ביום שבת" on a Saturday = next
 *   Saturday). Bare names are dates only after "עד" or with ב/יום ("שני חלבים" is not Monday).
 * - "השבוע" is the Saturday of this Sunday–Saturday week (today, if today is Saturday).
 *   "סוף השבוע" / "בסופ"ש" is the coming Friday (today, if today is Friday). The longer phrase wins,
 *   so "סוף השבוע" is never also read as "השבוע".
 * - "בשבוע הבא" is the next Sunday; "בעוד שבוע" is today + 7.
 * - A date with no year that already passed rolls to next year (29/2 waits for a leap year).
 * - "עד <date>" (or "מועד אחרון <date>") sets dueDate instead of scheduledFor.
 * - Only the first phrase per field is consumed; a second date etc. stays in the title.
 */
export function parseQuickAdd(input: string, now: Date, tz: string = DEFAULT_TZ): ParseResult {
  const raw = typeof input === 'string' ? input : '';
  try {
    return parseUnsafe(raw, now, tz);
    /* v8 ignore start -- safety net: the fuzz tests assert it is never reached */
  } catch {
    return { title: collapse(raw), matches: [] };
  }
  /* v8 ignore stop */
}

/**
 * The title for `input` when exactly `matches` are consumed from it (category matches are never
 * consumed: their words belong to the title). Use it to rebuild the title after the user dismisses a
 * chip: pass the remaining matches. Falls back to the raw input when nothing is left.
 */
export function rebuildTitle(input: string, matches: readonly ParseMatch[]): string {
  const ranges = matches.filter((m) => m.kind !== 'category').map((m) => [m.start, m.end] as Span);
  return buildTitle(input, ranges) || collapse(input);
}

/**
 * `input` with the text of `match` removed and tidied (no stray spaces, commas, dashes or dangling
 * "עד"), so that re-parsing it no longer produces that field. The offsets are checked against
 * `match.text`; a stale match is located by its text instead.
 */
export function removeMatch(
  input: string,
  match: Pick<ParseMatch, 'start' | 'end' | 'text'>
): string {
  let { start, end } = match;
  if (input.slice(start, end) !== match.text) {
    start = match.text ? input.indexOf(match.text) : -1;
    if (start < 0) return buildTitle(input, []);
    end = start + match.text.length;
  }
  return buildTitle(input, [[start, end]]);
}

// ───────────────────────────── normalisation ─────────────────────────────

interface Normalized {
  text: string;
  /** For each UTF-16 unit of `text`: the [start, end) span of its source in the original input. */
  starts: number[];
  ends: number[];
}

const NIQQUD_RE = /[\u{591}-\u{5BD}\u{5BF}\u{5C1}\u{5C2}\u{5C4}\u{5C5}\u{5C7}]/u;
// whitespace, maqaf, hyphens/dashes and invisible bidi/format marks all separate words
const SPACE_RE =
  /[\s\u{5BE}\-\u{2010}-\u{2015}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}\u{2066}-\u{2069}\u{FEFF}]/u;
const MARK_RE = /^\p{M}/u;

function normalize(input: string): Normalized {
  const chars: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const push = (unit: string, from: number, to: number) => {
    chars.push(unit);
    starts.push(from);
    ends.push(to);
  };

  let i = 0;
  while (i < input.length) {
    // A cluster is one code point plus its combining marks (letter + niqqud). Normalising per
    // cluster keeps every output character mappable to the original offsets.
    let j = i + ((input.codePointAt(i) ?? 0) > 0xffff ? 2 : 1);
    while (j < input.length && MARK_RE.test(input.slice(j, j + 2))) {
      j += (input.codePointAt(j) ?? 0) > 0xffff ? 2 : 1;
    }
    for (const ch of input.slice(i, j).normalize('NFC')) {
      if (NIQQUD_RE.test(ch)) continue;
      if (SPACE_RE.test(ch)) {
        if (chars.length > 0 && chars[chars.length - 1] !== ' ') push(' ', i, j);
        continue;
      }
      for (let k = 0; k < ch.length; k++) push(ch.charAt(k), i, j);
    }
    i = j;
  }
  return { text: chars.join(''), starts, ends };
}

// ───────────────────────────── regex plumbing ─────────────────────────────

const LETTER_OR_DIGIT = '\\p{L}\\p{N}';
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
/** A match must not run into a following letter or digit. */
const AFTER = `(?![${LETTER_OR_DIGIT}])`;
/** Same, and a number must not run into "/5", ".5" or ":5" either. */
const AFTER_NUM = `(?![${LETTER_OR_DIGIT}]|[/.:]\\d)`;
const PFX_CLASS = `[${PREFIX_LETTERS}]`;
/** 0–2 attached prefixes, as in "ולמחר". */
const ATTACHED = `${PFX_CLASS}{0,${MAX_PREFIXES}}`;
/** Optional prefixes: attached ("ומחר") or one detached letter left by a hyphen ("ב-מחר" → "ב מחר"). */
const PFX = `(?:${PFX_CLASS}{1,${MAX_PREFIXES}}|ו?${PFX_CLASS}\\s)?`;

/** Global, unicode regex for scanning. */
const rxg = (source: string): RegExp => new RegExp(source, 'gu');
/** Stateless regex for one-off tests. */
const rx1 = (source: string): RegExp => new RegExp(source, 'u');

interface Hit {
  start: number;
  end: number;
  m: RegExpExecArray;
}

const MAX_HITS = 1000;

/** Hits of `re` in `text` that start on a word boundary. Leftmost first, never loops forever. */
function scan(re: RegExp, text: string, numeric = false): Hit[] {
  const hits: Hit[] = [];
  re.lastIndex = 0;
  for (let n = 0; n < MAX_HITS; n++) {
    const m = re.exec(text);
    if (!m) break;
    const start = m.index;
    if (startsOnBoundary(text, start, numeric)) hits.push({ start, end: start + m[0].length, m });
    // Retry from the next unit so overlapping candidates are all seen. Every pattern starts with a
    // BMP character, so this never lands inside a surrogate pair.
    re.lastIndex = start + 1;
  }
  return hits;
}

function startsOnBoundary(text: string, start: number, numeric: boolean): boolean {
  if (start === 0) return true;
  const prev = text.charAt(start - 1);
  if (WORD_CHAR_RE.test(prev)) return false;
  return !(numeric && (prev === '/' || prev === '.' || prev === ':'));
}

/** Group `i` of a match, or ''. */
const group = (m: RegExpExecArray, i: number): string => m[i] ?? '';

const LOOKBACK = 24;

/** The text just before `idx`, cut at a word boundary so `^` anchors are safe. */
function lookback(text: string, idx: number): string {
  const from = Math.max(0, idx - LOOKBACK);
  if (from === 0) return text.slice(0, idx);
  const space = text.indexOf(' ', from);
  return space === -1 || space >= idx ? '' : text.slice(space, idx);
}

// ───────────────────────────── candidates ─────────────────────────────

type CandKind = 'date' | 'due' | 'hard' | 'time' | 'priority' | 'recurrence';

interface Cand {
  kind: CandKind;
  /** Indices into the normalised text. */
  start: number;
  end: number;
  iso?: ISODate; // date, due
  /** due only: introduced by "עד" or by "מועד אחרון". */
  intro?: 'until' | 'hard';
  time?: string;
  priority?: Exclude<Priority, 'normal'>;
  freq?: RecurrenceFreq;
}

const OUT_KIND: Record<CandKind, MatchKind> = {
  date: 'date',
  due: 'due',
  hard: 'due',
  time: 'time',
  priority: 'priority',
  recurrence: 'recurrence'
};

// ── dates ──

const DAY_NAMES = WEEKDAYS.map((w) => w.name);
const DAY_BY_NAME = new Map(WEEKDAYS.map((w) => [w.name, w.index]));
const DAY_BY_LETTER = new Map(WEEKDAYS.map((w) => [w.letter, w.index]));
const DAY_LETTERS = WEEKDAYS.map((w) => w.letter).join('');

const RE_REL = rxg(`${PFX}(${alt(Object.keys(RELATIVE_DAYS))})${AFTER}`);
const UPCOMING = `(?:\\s+(?:${alt(UPCOMING_WORDS)}))?`; // "…חמישי הקרוב"
// ביום ראשון / ליום ראשון / יום ה'. Not "היום ראשון" (today + a word) and not "מיום" (since).
const RE_YOM = rxg(
  `ו?[בל]?יום\\s+(?:(${alt(DAY_NAMES)})|([${DAY_LETTERS}])${GERESH_CLASS})${UPCOMING}${AFTER}`
);
const RE_BET_DAY = rxg(`ו?ב\\s?(${alt(DAY_NAMES)})${UPCOMING}${AFTER}`); // בראשון … בשבת
const RE_BARE_DAY = rxg(`ל?(${alt(DAY_NAMES)})${UPCOMING}${AFTER}`); // only valid right after "עד"
const RE_OFFSET = rxg(
  `${PFX}${IN_WORD}\\s+(?:(\\d{1,3}|${alt(Object.keys(NUMBER_WORDS))})\\s+(${alt(Object.keys(OFFSET_UNITS))})` +
    `|(${alt(Object.keys(DUAL_UNITS))})` +
    `|(${alt(['יום', 'שבוע', 'חודש'])})(?:\\s+(?:${alt(ONE_WORDS)}))?)${AFTER}`
);
const RE_NUMERIC = rxg(`${PFX}(\\d{1,2})[/.](\\d{1,2})(?:[/.](20\\d{2}|\\d{2}))?${AFTER_NUM}`);

const MONTH_BY_NAME = new Map(MONTHS.flatMap((mo) => mo.names.map((n) => [n, mo.month] as const)));
const RE_MONTH_NAME = rxg(
  `${PFX}(\\d{1,2})\\s+${ATTACHED}(${alt([...MONTH_BY_NAME.keys()])})(?:\\s+(20\\d{2}))?${AFTER}`
);

const PERIODS: readonly { re: RegExp; resolve: (today: ISODate) => ISODate }[] = [
  {
    re: rxg(`${PFX}(?:${alt(PERIOD_PHRASES.weekend)})${AFTER}`),
    resolve: (today) => nextWeekdayOnOrAfter(today, 5)
  },
  { re: rxg(`${PFX}(?:${alt(PERIOD_PHRASES.monthEnd)})${AFTER}`), resolve: endOfMonth },
  { re: rxg(`${PFX}(?:${alt(PERIOD_PHRASES.thisWeek)})${AFTER}`), resolve: endOfWeek },
  {
    re: rxg(`${PFX}(?:${alt(PERIOD_PHRASES.nextWeek)})${AFTER}`),
    resolve: (today) => nextWeekdayAfter(today, 0)
  },
  { re: rxg(`${PFX}(?:${alt(PERIOD_PHRASES.nextMonth)})${AFTER}`), resolve: startOfNextMonth }
];

const RE_EVERY_BEFORE = rx1(`(?:^|\\s)${ATTACHED}${lit(EVERY_WORD)}\\s+$`);
const RE_INTRO = rx1(`(?:^|\\s)(ו?${lit(UNTIL_WORD)}|${lit(HARD_DEADLINE_PHRASE)}:?)\\s+$`);

interface DateHit {
  start: number;
  end: number;
  iso: ISODate;
  /** Only meaningful after "עד" / "מועד אחרון" (bare weekday names). */
  needsIntro?: boolean;
}

const RE_UNIT_AFTER = rx1(`^\\s?(?:${alt(UNIT_WORDS)})${AFTER}`);
const RE_CURRENCY_BEFORE = rx1('[₪$€£]\\s?$');

/** True when a dd/mm-looking hit is really a quantity or a price. */
function isQuantity(text: string, h: Hit): boolean {
  return (
    RE_UNIT_AFTER.test(text.slice(h.end, h.end + 12)) ||
    RE_CURRENCY_BEFORE.test(lookback(text, h.start))
  );
}

function resolveDMY(
  day: number,
  month: number,
  yearText: string | undefined,
  today: ISODate
): ISODate | null {
  if (!yearText) return nextOccurrence(month, day, today);
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  return isValidYMD(year, month, day) ? toISO(year, month, day) : null;
}

function offsetDate(today: ISODate, n: number, unit: OffsetUnit): ISODate | null {
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  if (unit === 'day') return addDays(today, n);
  return unit === 'week' ? addDays(today, 7 * n) : addMonths(today, n);
}

function collectDateHits(text: string, today: ISODate): DateHit[] {
  const out: DateHit[] = [];
  const add = (h: Hit, iso: ISODate | null | undefined, needsIntro = false) => {
    if (iso) out.push({ start: h.start, end: h.end, iso, needsIntro });
  };
  const weekdayDate = (index: number | undefined) =>
    index === undefined ? null : nextWeekdayAfter(today, index);

  for (const h of scan(RE_REL, text)) {
    add(h, addDays(today, RELATIVE_DAYS[group(h.m, 1)] ?? 0));
  }
  for (const h of scan(RE_YOM, text)) {
    const name = group(h.m, 1);
    add(h, weekdayDate(name ? DAY_BY_NAME.get(name) : DAY_BY_LETTER.get(group(h.m, 2))));
  }
  for (const h of scan(RE_BET_DAY, text)) add(h, weekdayDate(DAY_BY_NAME.get(group(h.m, 1))));
  for (const h of scan(RE_BARE_DAY, text)) {
    add(h, weekdayDate(DAY_BY_NAME.get(group(h.m, 1))), true);
  }
  for (const period of PERIODS) {
    for (const h of scan(period.re, text)) add(h, period.resolve(today));
  }
  for (const h of scan(RE_OFFSET, text)) {
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
    if (isQuantity(text, h)) continue; // "1/2 קילו", "₪2.5": a number, not a date
    add(
      h,
      resolveDMY(Number(group(h.m, 1)), Number(group(h.m, 2)), group(h.m, 3) || undefined, today)
    );
  }
  for (const h of scan(RE_MONTH_NAME, text)) {
    const month = MONTH_BY_NAME.get(group(h.m, 2));
    add(
      h,
      month ? resolveDMY(Number(group(h.m, 1)), month, group(h.m, 3) || undefined, today) : null
    );
  }
  return out;
}

/** "עד" / "מועד אחרון" right before `idx`, with the index where that introducer starts. */
function introBefore(text: string, idx: number): { start: number; hard: boolean } | null {
  const before = lookback(text, idx);
  const m = RE_INTRO.exec(before);
  if (!m) return null;
  const lead = /^\s/.test(m[0]) ? 1 : 0;
  return { start: idx - m[0].length + lead, hard: group(m, 1).startsWith('מועד') };
}

function dateCandidates(text: string, today: ISODate): Cand[] {
  const out: Cand[] = [];
  for (const h of collectDateHits(text, today)) {
    // "כל יום ראשון", "כל השבוע": a repeat or a span, not a date
    if (RE_EVERY_BEFORE.test(lookback(text, h.start))) continue;
    const intro = introBefore(text, h.start);
    if (h.needsIntro && !intro) continue;
    if (intro) {
      out.push({
        kind: 'due',
        start: intro.start,
        end: h.end,
        iso: h.iso,
        intro: intro.hard ? 'hard' : 'until'
      });
    } else {
      out.push({ kind: 'date', start: h.start, end: h.end, iso: h.iso });
    }
  }
  return out;
}

// ── "מועד אחרון" on its own ──

const RE_HARD = rxg(`${PFX}${lit(HARD_DEADLINE_PHRASE)}${AFTER}`);

function hardCandidates(text: string): Cand[] {
  return scan(RE_HARD, text).map((h) => ({ kind: 'hard', start: h.start, end: h.end }));
}

// ── times ──

// "ב-17:00", "בשעה 17:30", "עד 17:00", "עד השעה 17:30", or a bare "17:30"
const RE_TIME_COLON = rxg(
  `(?:ו?${lit(UNTIL_WORD)}\\s+)?(?:${ATTACHED}${HOUR_WORD}\\s+|ו?ב\\s?)?(\\d{1,2}):(\\d{2})${AFTER_NUM}`
);
// "בשעה 5", "בשעה 17.30": needs the word שעה so a bare number is never a time
const RE_TIME_HOUR = rxg(
  `(?:ו?${lit(UNTIL_WORD)}\\s+)?${ATTACHED}${HOUR_WORD}\\s+(\\d{1,2})(?:\\.(\\d{2}))?${AFTER_NUM}`
);

function clock(hourText: string, minuteText: string | undefined): string | null {
  let hour = Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (hour > 23 || minute > 59) return null;
  // a bare, unpadded hour under 8 means afternoon ("בשעה 5" → 17:00); "07" and "7:30" are literal
  if (
    minuteText === undefined &&
    hourText.length === 1 &&
    hour >= 1 &&
    hour < AFTERNOON_BEFORE_HOUR
  ) {
    hour += 12;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeCandidates(text: string): Cand[] {
  const out: Cand[] = [];
  for (const re of [RE_TIME_COLON, RE_TIME_HOUR]) {
    for (const h of scan(re, text, true)) {
      const time = clock(group(h.m, 1), h.m[2]);
      if (time) out.push({ kind: 'time', start: h.start, end: h.end, time });
    }
  }
  return out;
}

// ── priority ──

const LEVEL_RANK = { high: 1, urgent: 2 } as const;
const PRIORITY_LEVEL = new Map(
  PRIORITY_WORDS.flatMap((p) => p.words.map((w) => [w, p.priority] as const))
);
const PRIORITY_WORD_ALT = alt([...PRIORITY_LEVEL.keys()]);
const RE_PRIORITY = rxg(
  `[${PRIORITY_PREFIX_LETTERS}]{0,${MAX_PREFIXES}}(${PRIORITY_WORD_ALT})${AFTER}`
);
const RE_NOT_BEFORE = rx1(`(?:^|\\s)${lit(NEGATION_WORD)}\\s+$`);
const RE_NEGATED_WORD_BEFORE = rx1(
  `(?:^|\\s)${lit(NEGATION_WORD)}\\s+[${PRIORITY_PREFIX_LETTERS}]{0,${MAX_PREFIXES}}(?:${PRIORITY_WORD_ALT})$`
);
const RE_BANGS = /!+/g;

interface Marker {
  start: number;
  end: number;
  level: Exclude<Priority, 'normal'>;
}

function priorityCandidates(text: string): Cand[] {
  const markers: Marker[] = [];
  for (const h of scan(RE_PRIORITY, text)) {
    if (RE_NOT_BEFORE.test(lookback(text, h.start))) continue; // "לא דחוף"
    const level = PRIORITY_LEVEL.get(group(h.m, 1));
    if (level) markers.push({ start: h.start, end: h.end, level });
  }
  RE_BANGS.lastIndex = 0;
  for (let n = 0; n < MAX_HITS; n++) {
    const m = RE_BANGS.exec(text);
    if (!m) break;
    const start = m.index;
    const end = start + m[0].length;
    const next = text.charAt(end);
    if (text.charAt(start - 1) === '?' || next === '?') continue; // "?!" is a question
    if (RE_NEGATED_WORD_BEFORE.test(lookback(text, start))) continue; // "לא דחוף!"
    markers.push({ start, end, level: m[0].length >= 2 ? 'urgent' : 'high' });
  }
  markers.sort((a, b) => a.start - b.start);

  // "!! דחוף", "דחוף!" and "דחוף !" are one phrase: merge markers separated only by whitespace
  const out: Cand[] = [];
  let current: Marker | undefined;
  const flush = () => {
    if (current) {
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
      if (LEVEL_RANK[mk.level] > LEVEL_RANK[current.level]) current.level = mk.level;
    } else {
      flush();
      current = { ...mk };
    }
  }
  flush();
  return out;
}

// ── recurrence ──

const RECURRENCE_RES = (Object.keys(RECURRENCE_WORDS) as RecurrenceFreq[]).map((freq) => ({
  freq,
  re: rxg(`${PFX}(?:${alt(RECURRENCE_WORDS[freq])})${AFTER}`)
}));

function recurrenceCandidates(text: string): Cand[] {
  return RECURRENCE_RES.flatMap(({ freq, re }) =>
    scan(re, text).map((h): Cand => ({ kind: 'recurrence', start: h.start, end: h.end, freq }))
  );
}

// ── category (keywords stay in the title) ──

const CATEGORY_RES = CATEGORY_KEYWORDS.map(({ id, keywords }) => ({
  id,
  re: rxg(`${ATTACHED}(?:${alt(keywords)})${AFTER}`)
}));

function findCategory(
  text: string,
  consumed: readonly Cand[]
): { id: CategoryId; start: number; end: number } | null {
  for (const { id, re } of CATEGORY_RES) {
    for (const h of scan(re, text)) {
      // A keyword inside a consumed phrase would give overlapping chips. The current lexicon has no
      // such collision; this keeps it that way if a keyword is added later.
      /* v8 ignore next */
      if (consumed.some((c) => h.start < c.end && c.start < h.end)) continue;
      return { id, start: h.start, end: h.end };
    }
  }
  return null;
}

// ───────────────────────────── selection ─────────────────────────────

/** Earliest start wins, then the longest; overlapping losers are dropped. */
function resolveOverlaps(cands: readonly Cand[]): Cand[] {
  const sorted = [...cands].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Cand[] = [];
  let lastEnd = -1;
  for (const c of sorted) {
    if (c.start >= lastEnd) {
      kept.push(c);
      lastEnd = c.end;
    }
  }
  return kept;
}

function leftmost(cands: readonly Cand[], kind: CandKind): Cand | undefined {
  let best: Cand | undefined;
  for (const c of cands) if (c.kind === kind && (!best || c.start < best.start)) best = c;
  return best;
}

function topPriority(cands: readonly Cand[]): Cand | undefined {
  let best: Cand | undefined;
  for (const c of cands) {
    if (c.kind !== 'priority' || !c.priority) continue;
    const better =
      !best ||
      !best.priority ||
      LEVEL_RANK[c.priority] > LEVEL_RANK[best.priority] ||
      (LEVEL_RANK[c.priority] === LEVEL_RANK[best.priority] && c.start < best.start);
    if (better) best = c;
  }
  return best;
}

// ───────────────────────────── the parser ─────────────────────────────

function parseUnsafe(input: string, now: Date, tz: string): ParseResult {
  const norm = normalize(input);
  const text = norm.text;
  const today = todayInTz(now, tz);

  const kept = resolveOverlaps([
    ...dateCandidates(text, today),
    ...hardCandidates(text),
    ...timeCandidates(text),
    ...priorityCandidates(text),
    ...recurrenceCandidates(text)
  ]);

  let date = leftmost(kept, 'date');
  let due = leftmost(kept, 'due');
  const hardPhrase = leftmost(kept, 'hard');
  const time = leftmost(kept, 'time');
  const recurrence = leftmost(kept, 'recurrence');
  const priority = topPriority(kept);

  // "מועד אחרון" without "עד": the date in the line is the deadline
  let hardDeadline = due?.intro === 'hard' || hardPhrase !== undefined;
  if (hardDeadline && !due && date) {
    due = { ...date, kind: 'due', intro: 'hard' };
    date = undefined;
  }

  const consumed = [date, due, hardPhrase, time, recurrence, priority].filter(
    (c): c is Cand => c !== undefined
  );
  const category = findCategory(text, consumed);
  if (category?.id === 'returns' && due?.intro === 'until') hardDeadline = true;

  const origin = (start: number, end: number) => ({
    start: norm.starts[start] ?? 0,
    end: norm.ends[end - 1] ?? input.length
  });
  const matches: ParseMatch[] = [
    ...consumed.map((c) => ({ kind: OUT_KIND[c.kind], ...origin(c.start, c.end) })),
    ...(category ? [{ kind: 'category' as const, ...origin(category.start, category.end) }] : [])
  ]
    .map((m) => ({ ...m, text: input.slice(m.start, m.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result: ParseResult = { title: '', matches };
  if (date?.iso) result.scheduledFor = date.iso;
  if (due?.iso) result.dueDate = due.iso;
  if (time?.time) result.dueTime = time.time;
  if (hardDeadline) result.hardDeadline = true;
  if (priority?.priority) result.priority = priority.priority;
  if (category) result.categoryId = category.id;
  if (recurrence?.freq) result.recurrence = { freq: recurrence.freq };
  result.title = rebuildTitle(input, matches);
  return result;
}

// ───────────────────────────── title tidy ─────────────────────────────

type Span = [start: number, end: number];

const SEP = '[\\s,;:\\-\u{2010}-\u{2015}\u{5BE}]';
const LEADING_SEP_RE = new RegExp(`^(?:${SEP}|\\.(?=\\s|$))+`);
const TRAILING_SEP_RE = new RegExp(`(?:${SEP}|\\.)+$`);
const DASH = '[\\-\u{2010}-\u{2015}\u{5BE}]';
/** A one-letter prefix with its hyphen but nothing after it ("ב-" typed and abandoned) at an edge. */
const DANGLING_PREFIX_TRAIL_RE = new RegExp(`(?:^|\\s)${PFX_CLASS}\\s?${DASH}\\s*$`);
const DANGLING_PREFIX_LEAD_RE = new RegExp(`^${PFX_CLASS}\\s?${DASH}\\s+`);
const EMPTY_BRACKETS_RE = /\(\s*\)|\[\s*\]|\{\s*\}/g;
/** A "עד" that ends the text right before a removed phrase: whatever it introduced is gone. */
const DANGLING_UNTIL_RE = new RegExp(`(?:^|\\s)${lit(UNTIL_WORD)}$`, 'u');

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

function mergeRanges(ranges: readonly Span[]): Span[] {
  const sorted = ranges
    .filter(([s, e]) => e > s)
    .map(([s, e]): Span => [s, e])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Span[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }
  return merged;
}

/**
 * `input` minus `ranges`, tidied: whitespace collapsed, separators orphaned by a removal dropped,
 * a "עד" left hanging right before a removed phrase dropped, empty brackets dropped, and
 * punctuation trimmed from both ends. Words the user typed are never otherwise touched. Can be empty.
 */
function buildTitle(input: string, ranges: readonly Span[]): string {
  const cuts = mergeRanges(ranges);
  const segments: string[] = [];
  let pos = 0;
  for (const [start, end] of cuts) {
    segments.push(input.slice(pos, start));
    pos = end;
  }
  segments.push(input.slice(pos));

  let out = segments[0] ?? '';
  for (let i = 1; i < segments.length; i++) {
    // The text before a removed phrase loses the separators and the dangling "עד" that led into it.
    for (let prev = ''; prev !== out;) {
      prev = out;
      out = out.replace(TRAILING_SEP_RE, '').replace(DANGLING_UNTIL_RE, '');
    }
    // A removed phrase takes the separator that followed it ("מחר, לשלם" → "לשלם").
    const rest = (segments[i] ?? '').replace(LEADING_SEP_RE, '');
    if (rest) out = `${out} ${rest}`;
  }
  let title = collapse(out);
  if (cuts.length > 0) title = collapse(title.replace(EMPTY_BRACKETS_RE, ''));
  for (let prev = ''; prev !== title;) {
    prev = title;
    title = title
      .replace(DANGLING_PREFIX_TRAIL_RE, '')
      .replace(DANGLING_PREFIX_LEAD_RE, '')
      .replace(LEADING_SEP_RE, '')
      .replace(TRAILING_SEP_RE, '');
  }
  return title;
}
