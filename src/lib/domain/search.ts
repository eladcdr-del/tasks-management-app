// Hebrew-aware search over the house memory (Blueprint §3 "Domain rules" + 1.2 QA amendments,
// §7 Memory). The target: "מתי החלפנו מצבר ובאיזה מוסך?" finds "החלפת מצבר" done at "מוסך השרון".
//
// Matching model. Both sides are normalised and split into tokens (normalizeHebrew, tokenize).
//  - QUERY stopwords (question and function words: מתי, איזה, של, ...) are dropped, also behind
//    prefix letters ("ובאיזה" -> "איזה"). The haystack keeps every word.
//  - Hebrew glues the prefix letters ו ה ב ל מ ש כ onto words. Up to two are peeled off a token, on
//    either side, but ONLY while at least 3 letters remain: "במוסך" -> "מוסך", while "שמן" is never
//    "ש" + "מן" (which used to match "מנוי"), nor "כסף" "כ" + "סף" (-> "ספר").
//  - A query token of 4+ letters is also folded: one suffix or construct ending (נו תי תם תן ים ות
//    ה ת ו י) is stripped, keeping 3+ letters, and the stem is prefix-matched: "החלפנו" -> "החלפ-"
//    finds "החלפת", "בדיקה" -> "בדיק-" finds "בדיקת". A stem of exactly 3 letters is too short to
//    prefix-match safely ("מתנה" -> "מתנ-" would find "מתנע"), so it must be followed by nothing or
//    by one of those endings ("מתנות").
//  - Every remaining query token must match some haystack token (any order). Prefix matching (rather
//    than equality) is what makes partial typing work ("מצב" finds "מצבר").
//
// Score (scoreQuery): each query token scores by its best match, then the scores are added up.
//   3 exact    the token equals a haystack word (the haystack's own prefix letters are transparent:
//              "מוסך" is an exact match for "במוסך")
//   2 prefix   a haystack word starts with the token (partial typing)
//   1 loose    only after peeling the query's prefix letters or folding its suffix
// searchDoneTasks ranks by score, then newest completion.

import type { CategoryId, Task } from './types';

const PREFIX_LETTERS = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ']);
const MAX_PREFIX_LETTERS = 2;
/** A peeled word must keep at least this many letters ("במוסך" -> "מוסך"; "שמן" stays "שמן"). */
const MIN_REMAINDER = 3;
/** Only query tokens this long are suffix-folded... */
const FOLD_MIN_TOKEN = 4;
/** ...and the stem keeps at least this many letters. */
const FOLD_MIN_STEM = 3;

// Final letters and their regular forms, position for position (ך→כ ם→מ ן→נ ף→פ ץ→צ).
const FINAL_FORMS = 'ךםןףץ';
const REGULAR_FORMS = 'כמנפצ';

// Zero-width space / non-joiner / joiner, word joiner, BOM: they separate words in pasted text.
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
// Bidi controls (LRM, RLM, embeddings, overrides, isolates): invisible, removed.
const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
// Niqqud + cantillation (U+0591-U+05BD, U+05BF, U+05C1-2, U+05C4-5, U+05C7), without the
// maqaf / paseq / sof-pasuq punctuation.
const POINTS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;
// Hebrew punctuation that separates words: maqaf, paseq, sof pasuq, nun hafukha.
const HEBREW_SEPARATORS = /[\u05BE\u05C0\u05C3\u05C6]/g;
// Geresh, gershayim and quote marks (ASCII and typographic): dropped, so פנצ'ר == פנצר and בסופ"ש == בסופש.
const QUOTES = /['"`\u00B4\u05F3\u05F4\u2018-\u201F\u2032\u2033]/g;
// A hyphen (hyphen-minus, U+2010 hyphen, U+2011 non-breaking hyphen, U+2012 figure dash, U+2013 en
// dash) between two digits / Latin letters: dropped, so 050-1234567 == 0501234567 and Wi-Fi == wifi.
const INNER_HYPHEN = /([0-9a-z])[-\u2010-\u2013](?=[0-9a-z])/g;
const FINAL_LETTERS = new RegExp(`[${FINAL_FORMS}]`, 'g');
const NOT_WORD = /[^\p{L}\p{M}\p{N}]+/u;

/**
 * Canonical form for comparing Hebrew (and mixed) text: NFC; bidi controls removed and zero-width
 * characters turned into spaces; niqqud, cantillation, geresh, gershayim and quotes removed; maqaf
 * turned into a space; final letters folded (ך→כ ם→מ ן→נ ף→פ ץ→צ); Latin lower-cased; hyphens inside
 * digit / Latin runs dropped; whitespace collapsed and trimmed.
 */
export function normalizeHebrew(s: string): string {
  return s
    .normalize('NFC')
    .replace(BIDI_CONTROLS, '')
    .replace(ZERO_WIDTH, ' ')
    .replace(POINTS, '')
    .replace(QUOTES, '')
    .replace(HEBREW_SEPARATORS, ' ')
    .replace(FINAL_LETTERS, (ch) => REGULAR_FORMS.charAt(FINAL_FORMS.indexOf(ch)))
    .toLowerCase()
    .replace(INNER_HYPHEN, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalised words: split on everything that is not a letter, mark or digit. */
export function tokenize(s: string): string[] {
  return normalizeHebrew(s).split(NOT_WORD).filter(Boolean);
}

/** Suffix and construct endings, longest first, in normalised form (תם→תמ, תן→תנ, ים→ימ). */
const SUFFIXES = ['נו', 'תי', 'תם', 'תן', 'ים', 'ות', 'ה', 'ת', 'ו', 'י'].map(normalizeHebrew);
const ENDINGS = new Set(['', ...SUFFIXES]);

const STOPWORDS = new Set(
  [
    'מתי',
    'איפה',
    'איזה',
    'איזו',
    'אילו',
    'מי',
    'מה',
    'כמה',
    'למה',
    'של',
    'את',
    'עם',
    'על',
    'גם',
    'כבר',
    'פעם',
    'האחרון',
    'האחרונה'
  ].map(normalizeHebrew)
);

/** The token itself followed by the forms with 1 and 2 leading prefix letters peeled off. */
function peelings(token: string): string[] {
  const forms = [token];
  let rest = token;
  for (let i = 0; i < MAX_PREFIX_LETTERS; i++) {
    if (rest.length - 1 < MIN_REMAINDER || !PREFIX_LETTERS.has(rest.charAt(0))) break;
    rest = rest.slice(1);
    forms.push(rest);
  }
  return forms;
}

/** The stem left after stripping one suffix (longest first), or null when none applies. */
function fold(form: string): string | null {
  if (form.length < FOLD_MIN_TOKEN) return null;
  const suffix = SUFFIXES.find((s) => form.endsWith(s) && form.length - s.length >= FOLD_MIN_STEM);
  return suffix === undefined ? null : form.slice(0, -suffix.length);
}

/**
 * A stopword, also behind prefix letters ("ובאיזה"). The 3-letter peeling floor would keep "ומה"
 * whole, so a single leading ו is also tried on its own; other short prefixes are not, because
 * "בעל" or "העם" are words, not ב + על / ה + עם.
 */
function isStopword(token: string): boolean {
  if (peelings(token).some((f) => STOPWORDS.has(f))) return true;
  return token.startsWith('ו') && STOPWORDS.has(token.slice(1));
}

interface QueryToken {
  raw: string;
  /** Forms with prefix letters peeled off (the raw token excluded). */
  peeled: string[];
  /** Suffix-folded stems of the raw and peeled forms. */
  stems: string[];
}

function compileQuery(query: string): QueryToken[] {
  return tokenize(query)
    .filter((t) => !isStopword(t))
    .map((raw) => {
      const forms = peelings(raw);
      const stems = forms.map(fold).filter((s): s is string => s !== null);
      return { raw, peeled: forms.slice(1), stems };
    });
}

/** Every haystack token with its prefix-peeled forms, flattened. */
const haystackForms = (text: string): string[] => tokenize(text).flatMap(peelings);

/** A haystack word matches a folded stem: by prefix, or for a 3-letter stem only stem + ending. */
const stemMatches = (word: string, stem: string): boolean =>
  word.startsWith(stem) && (stem.length > FOLD_MIN_STEM || ENDINGS.has(word.slice(stem.length)));

const EXACT = 3;
const PREFIX = 2;
const LOOSE = 1;

function tokenScore(q: QueryToken, hay: readonly string[]): number {
  if (hay.includes(q.raw)) return EXACT;
  if (hay.some((h) => h.startsWith(q.raw))) return PREFIX;
  const loose = hay.some(
    (h) => q.peeled.some((p) => h.startsWith(p)) || q.stems.some((s) => stemMatches(h, s))
  );
  return loose ? LOOSE : 0;
}

/** An empty query (or one of stopwords only) matches everything with this score. */
const EMPTY_QUERY_SCORE = 1;

function scoreCompiled(hay: readonly string[], query: readonly QueryToken[]): number {
  if (query.length === 0) return EMPTY_QUERY_SCORE;
  let total = 0;
  for (const q of query) {
    const score = tokenScore(q, hay);
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

/**
 * How well `haystack` satisfies `query`: 0 when some (non-stopword) query token matches nothing,
 * otherwise the sum of the token scores (exact 3, prefix 2, peeled/folded 1; see the file header).
 * An empty or stopword-only query scores 1 for any haystack.
 */
export function scoreQuery(haystack: string, query: string): number {
  return scoreCompiled(haystackForms(haystack), compileQuery(query));
}

/** Does `haystack` satisfy `query`? Exactly `scoreQuery(haystack, query) > 0`. */
export function matchesQuery(haystack: string, query: string): boolean {
  return scoreQuery(haystack, query) > 0;
}

export interface SearchFilters {
  categoryId?: CategoryId | null;
  /** Matches the member who completed the task (`completedBy`). */
  memberId?: string | null;
}

/**
 * Searches completed tasks over title, notes and the documentation (completion note, place,
 * contact). Open tasks are ignored. With an empty query it just filters. Ranked by match quality
 * (scoreQuery, best first), then newest completion (tasks without a completedAt last); full ties
 * keep their input order.
 */
export function searchDoneTasks(
  tasks: readonly Task[],
  query: string,
  filters: SearchFilters = {}
): Task[] {
  const wanted = compileQuery(query);
  const { categoryId, memberId } = filters;
  const hits: { task: Task; score: number }[] = [];
  for (const t of tasks) {
    if (t.status !== 'done') continue;
    if (categoryId != null && t.categoryId !== categoryId) continue;
    if (memberId != null && t.completedBy !== memberId) continue;
    const text = [t.title, t.notes, t.completion?.note, t.completion?.place, t.completion?.contact]
      .filter(Boolean)
      .join(' ');
    const score = scoreCompiled(haystackForms(text), wanted);
    if (score > 0) hits.push({ task: t, score });
  }
  return hits
    .sort((a, b) => b.score - a.score || (b.task.completedAt ?? 0) - (a.task.completedAt ?? 0))
    .map((h) => h.task);
}
