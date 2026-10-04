// Text plumbing for the quick-add parser: normalisation with an offset map back to the original
// input, the regex helpers every candidate finder uses, and the title tidy-up.

import { lit, MAX_PREFIXES, PREFIX_LETTERS, REMINDER_LEADS, UNTIL_WORD, alt } from './lexicon';

// ───────────────────────────── normalisation ─────────────────────────────

export interface Normalized {
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

/** NFC, niqqud dropped, maqaf / hyphens / bidi marks turned into single spaces. */
export function normalize(input: string): Normalized {
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
export const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
/** A match must not run into a following letter or digit. */
export const AFTER = `(?![${LETTER_OR_DIGIT}])`;
/** Same, and a number must not run into "/5", ".5" or ":5" either. */
export const AFTER_NUM = `(?![${LETTER_OR_DIGIT}]|[/.:]\\d)`;
export const PFX_CLASS = `[${PREFIX_LETTERS}]`;
/** 0–2 attached prefixes, as in "ולמחר". */
export const ATTACHED = `${PFX_CLASS}{0,${MAX_PREFIXES}}`;
/** Optional prefixes: attached ("ומחר") or one detached letter left by a hyphen ("ב-מחר" → "ב מחר"). */
export const PFX = `(?:${PFX_CLASS}{1,${MAX_PREFIXES}}|ו?${PFX_CLASS}\\s)?`;
/** The same, captured (group 1 of the caller's pattern must be this). */
export const PFX_CAPTURE = `(${PFX_CLASS}{1,${MAX_PREFIXES}}|ו?${PFX_CLASS}\\s)?`;

/** Global, unicode regex for scanning. */
export const rxg = (source: string): RegExp => new RegExp(source, 'gu');
/** Stateless regex for one-off tests. */
export const rx1 = (source: string): RegExp => new RegExp(source, 'u');

export interface Hit {
  start: number;
  end: number;
  m: RegExpExecArray;
}

const MAX_HITS = 1000;

/** Hits of `re` in `text` that start on a word boundary. Leftmost first, never loops forever. */
export function scan(re: RegExp, text: string, numeric = false): Hit[] {
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
export const group = (m: RegExpExecArray, i: number): string => m[i] ?? '';

const LOOKBACK = 40;

/** The text just before `idx` (about five words), cut at a word boundary so `^` anchors are safe. */
export function lookback(text: string, idx: number): string {
  const from = Math.max(0, idx - LOOKBACK);
  if (from === 0) return text.slice(0, idx);
  const space = text.indexOf(' ', from);
  return space === -1 || space >= idx ? '' : text.slice(space, idx);
}

/** One of `words`, with 0–2 prefixes, as a whole word anywhere in the text. */
export const anywhereRe = (words: readonly string[]): RegExp =>
  rx1(`(?:^|[^${LETTER_OR_DIGIT}])${ATTACHED}(?:${alt(words)})(?![${LETTER_OR_DIGIT}])`);

/** A regex matching one of `words` (with 0–2 prefixes) as the LAST word before the lookback end. */
export function lastWordRe(words: readonly string[], toRegex: (w: string) => string = lit): RegExp {
  return rx1(`(?:^|[^${LETTER_OR_DIGIT}])${ATTACHED}(?:${alt(words, toRegex)})\\s+$`);
}

// ───────────────────────────── title tidy ─────────────────────────────

export type Span = [start: number, end: number];

const SEP = '[\\s,;:\\-\u{2010}-\u{2015}\u{5BE}]';
const LEADING_SEP_RE = new RegExp(`^(?:${SEP}|\\.(?=\\s|$))+`);
const TRAILING_SEP_RE = new RegExp(`(?:${SEP}|\\.)+$`);
const DASH = '[\\-\u{2010}-\u{2015}\u{5BE}]';
/** A one-letter prefix with its hyphen but nothing after it ("ב-" typed and abandoned) at an edge. */
const DANGLING_PREFIX_TRAIL_RE = new RegExp(`(?:^|\\s)${PFX_CLASS}\\s?${DASH}\\s*$`);
const DANGLING_PREFIX_LEAD_RE = new RegExp(`^${PFX_CLASS}\\s?${DASH}\\s+`);
const EMPTY_BRACKETS_RE = /\(\s*\)|\[\s*\]|\{\s*\}/g;
/** A standalone pair of quotes with nothing inside, left behind by a removed phrase: `לשלם ""`. */
const EMPTY_QUOTES_RE =
  /(^|\s)(?:"\s*"|'\s*'|\u{5F4}\s*\u{5F4}|\u{201C}\s*\u{201D}|\u{201D}\s*\u{201D}|\u{201E}\s*\u{201C})(?=\s|$)/gu;
/** A "עד" that ends the text right before a removed phrase: whatever it introduced is gone. */
const DANGLING_UNTIL_RE = new RegExp(`(?:^|\\s)${lit(UNTIL_WORD)}$`, 'u');
/** "תזכיר לי" at the very start, with the separators after it. */
const REMINDER_LEAD_RE = new RegExp(`^(?:${alt(REMINDER_LEADS)})(?:${SEP})+`, 'u');

/** A word that starts a new clause: an infinitive or a ו-conjunction ("לקנות", "ולהתקשר"). */
const CLAUSE_START_RE = /^(?:ו\p{L}|ל\p{L}{3,})/u;

export const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

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
 * a "עד" left hanging right before a removed phrase dropped, empty brackets and quote pairs dropped,
 * and punctuation trimmed from both ends. Words the user typed are never otherwise touched. Can be
 * empty.
 */
export function buildTitle(input: string, ranges: readonly Span[]): string {
  const cuts = mergeRanges(ranges);
  const segments: string[] = [];
  let pos = 0;
  for (const [start, end] of cuts) {
    segments.push(input.slice(pos, start));
    pos = end;
  }
  segments.push(input.slice(pos));

  let out = segments[0] ?? '';
  // a clause comma next to a removed phrase in mid-sentence survives the removal (council M3):
  // "להתקשר לסבתא מחר, לקנות לה פרחים" → "להתקשר לסבתא, לקנות לה פרחים"
  let comma = false;
  for (let i = 1; i < segments.length; i++) {
    // The text before a removed phrase loses the separators and the dangling "עד" that led into it.
    for (let prev = ''; prev !== out;) {
      prev = out;
      const trimmed = out.replace(TRAILING_SEP_RE, '');
      if (trimmed !== out && out.slice(trimmed.length).includes(',')) comma = true;
      out = trimmed.replace(DANGLING_UNTIL_RE, '');
    }
    // A removed phrase takes the separator that followed it ("מחר, לשלם" → "לשלם").
    const seg = segments[i] ?? '';
    const rest = seg.replace(LEADING_SEP_RE, '');
    if (seg.slice(0, seg.length - rest.length).includes(',')) comma = true;
    if (!rest) continue;
    // "לנקות בשבת!" → "לנקות!": a closing ! or ? stays attached to the word before it
    if (/^[!?]/.test(rest)) out = `${out}${rest}`;
    else
      out =
        comma && WORD_CHAR_RE.test(out) && CLAUSE_START_RE.test(rest)
          ? `${out}, ${rest}`
          : `${out} ${rest}`;
    comma = false;
  }
  let title = collapse(out);
  if (cuts.length > 0) {
    title = collapse(title.replace(EMPTY_BRACKETS_RE, '').replace(EMPTY_QUOTES_RE, '$1'));
  }
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

/** Drops a leading "תזכיר לי" (and its variants) unless nothing would be left. */
export function stripReminderLead(title: string): string {
  const rest = title.replace(REMINDER_LEAD_RE, '');
  return rest === title || !WORD_CHAR_RE.test(rest) ? title : rest.replace(LEADING_SEP_RE, '');
}
