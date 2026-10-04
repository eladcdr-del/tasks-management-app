// Hebrew-aware search over the house memory (Blueprint §3 "Domain rules" + the 1.2 QA and Phase 1
// council amendments, §7 Memory). The target: "מתי החלפנו מצבר ובאיזה מוסך?" finds "החלפת מצבר"
// done at "מוסך השרון", and natural questions ("כמה שילמנו על הארנונה?", "מי תיקן את הדוד?") find
// the task they are about.
//
// Matching model. Both sides are normalised and split into tokens (normalizeHebrew, tokenize).
//  - QUERY stopwords are dropped, also behind prefix letters ("ובאיזה" -> "איזה"): question and
//    function words (מתי, איזה, של, שלו, ...) and the past-tense verbs questions open with (שילמנו,
//    תיקן, עשינו, קנינו, עלה, ...: "החלפנו" rarely matches the noun "החלפת" anyway, and the object
//    of the question carries the meaning). The haystack keeps every word.
//  - Hebrew glues the prefix letters ו ה ב ל מ ש כ onto words. Up to two are peeled off a token, on
//    either side, but ONLY while at least 3 letters remain: "במוסך" -> "מוסך", while "שמן" is never
//    "ש" + "מן" (which used to match "מנוי"), nor "כסף" "כ" + "סף" (-> "ספר").
//  - A query token of 4+ letters is also folded: one suffix or construct ending (נו תי תם תן ים ות
//    ה ת ו י) is stripped, keeping 3+ letters, and the stem is prefix-matched: "החלפתי" -> "החלפ-"
//    finds "החלפת", "בדיקה" -> "בדיק-" finds "בדיקת". A stem of exactly 3 letters is too short to
//    prefix-match safely ("מתנה" -> "מתנ-" would find "מתנע"), so it must be followed by nothing or
//    by one of those endings ("מתנות").
//  - Peel budget: every peeled letter is a guess that it is a prefix and not part of the word, so a
//    LOOSE match (peeled or folded query) may strip at most 2 prefix letters in total, counting both
//    sides. "בלמים" (brakes) = ב + "למים" must not find "משלמים" = מש + "למים" (3 guesses), while
//    "ברכב" still finds "לרכב" (ב + רכב vs ל + רכב, 2 guesses).
//  - Synonyms: a query word from a synonym group (אוטו = מכונית = רכב) also matches the other
//    words of the group, as whole words (a folded plural is fine; partial typing is not, so רכב does
//    not find "אוטובוס").
//  - Every remaining query token must match some haystack token (any order). Prefix matching (rather
//    than equality) is what makes partial typing work ("מצב" finds "מצבר").
//
// Score (scoreQuery): each query token scores by its best match, then the scores are added up.
//   3 exact    the token equals a haystack word (the haystack's own prefix letters are transparent:
//              "מוסך" is an exact match for "במוסך")
//   2 prefix   a haystack word starts with the token (partial typing), or a synonym of the token
//   1 loose    only after peeling the query's prefix letters or folding its suffix
// searchDoneTasks ranks by score, then newest completion. When no task matches EVERY token it falls
// back to ranking by the number of tokens matched (at least one meaningful token, see searchDoneTasks).

import type { CategoryId, Task } from './types';

const PREFIX_LETTERS = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ']);
/** At most this many prefix letters are peeled off one word, and off a loose match in total. */
const MAX_PREFIX_LETTERS = 2;
/** A peeled word must keep at least this many letters ("במוסך" -> "מוסך"; "שמן" stays "שמן"). */
const MIN_REMAINDER = 3;
/** Only query tokens this long are suffix-folded... */
const FOLD_MIN_TOKEN = 4;
/** ...and the stem keeps at least this many letters. */
const FOLD_MIN_STEM = 3;
/** The fallback ranking only counts query tokens this long (a lone "ב" from "ב-2025" is no clue). */
const FALLBACK_MIN_TOKEN = 2;

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
    // question and function words
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
    'האחרונה',
    'האחרונים',
    'האחרונות',
    'זה',
    'זאת',
    'לנו',
    'האם',
    'איך',
    // pronouns ("ומה הטלפון שלו?": "שלו" must not prefix-match "שלושת")
    'הוא',
    'היא',
    'הם',
    'לו',
    'לה',
    'אותו',
    'אותה',
    'שלי',
    'שלו',
    'שלה',
    'שלנו',
    'שלהם',
    // past-tense verbs that natural questions open with ("כמה שילמנו על...", "מי תיקן את...")
    'שילמנו',
    'שילם',
    'שילמה',
    'עשינו',
    'עשה',
    'תיקן',
    'תיקנה',
    'תיקנו',
    'החלפנו',
    'החליף',
    'קנינו',
    'קנה',
    'החזרנו',
    'היה',
    'הייתה',
    'היו',
    'עלה',
    'עלתה',
    'עלו',
    'אמר',
    'אמרה',
    'הגיע',
    'הגיעה'
  ].map(normalizeHebrew)
);

/** Words that mean the same thing in a household's notes. Unambiguous groups only. */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [['רכב', 'אוטו', 'מכונית']].map((g) =>
  g.map(normalizeHebrew)
);
const SYNONYMS = new Map<string, readonly string[]>(
  SYNONYM_GROUPS.flatMap((group) => group.map((w) => [w, group.filter((o) => o !== w)] as const))
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

/** A word form together with the number of prefix letters peeled off to get it. */
interface Form {
  text: string;
  peeled: number;
}

const peeledForms = (token: string): Form[] =>
  peelings(token).map((text, peeled) => ({ text, peeled }));

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
  peeled: Form[];
  /** Suffix-folded stems of the raw and peeled forms. */
  stems: Form[];
  /** Synonyms of the token (or of a peeled form of it), each with its own stems. */
  synonyms: { word: string; stems: string[] }[];
}

const stemsOf = (forms: readonly Form[]): Form[] =>
  forms.flatMap((f) => {
    const stem = fold(f.text);
    return stem === null ? [] : [{ text: stem, peeled: f.peeled }];
  });

function compileQuery(query: string): QueryToken[] {
  return tokenize(query)
    .filter((t) => !isStopword(t))
    .map((raw) => {
      const forms = peeledForms(raw);
      const synonyms = [...new Set(forms.flatMap((f) => SYNONYMS.get(f.text) ?? []))].map(
        (word) => ({ word, stems: stemsOf([{ text: word, peeled: 0 }]).map((s) => s.text) })
      );
      return { raw, peeled: forms.slice(1), stems: stemsOf(forms), synonyms };
    });
}

/** Every haystack token with its prefix-peeled forms, flattened. */
const haystackForms = (text: string): Form[] => tokenize(text).flatMap(peeledForms);

/** A haystack word matches a folded stem: by prefix, or for a 3-letter stem only stem + ending. */
const stemMatches = (word: string, stem: string): boolean =>
  word.startsWith(stem) && (stem.length > FOLD_MIN_STEM || ENDINGS.has(word.slice(stem.length)));

/** Peeling `a` letters off the query and `b` off the haystack stays within the peel budget. */
const withinBudget = (a: Form, b: Form): boolean => a.peeled + b.peeled <= MAX_PREFIX_LETTERS;

const EXACT = 3;
const PREFIX = 2;
const SYNONYM = 2;
const LOOSE = 1;

function tokenScore(q: QueryToken, hay: readonly Form[]): number {
  if (hay.some((h) => h.text === q.raw)) return EXACT;
  if (hay.some((h) => h.text.startsWith(q.raw))) return PREFIX;
  const synonym = q.synonyms.some(({ word, stems }) =>
    hay.some((h) => h.text === word || stems.some((s) => stemMatches(h.text, s)))
  );
  if (synonym) return SYNONYM;
  const loose = hay.some(
    (h) =>
      q.peeled.some((p) => withinBudget(p, h) && h.text.startsWith(p.text)) ||
      q.stems.some((s) => withinBudget(s, h) && stemMatches(h.text, s.text))
  );
  return loose ? LOOSE : 0;
}

/** An empty query (or one of stopwords only) matches everything with this score. */
const EMPTY_QUERY_SCORE = 1;

function scoreCompiled(hay: readonly Form[], query: readonly QueryToken[]): number {
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
 * otherwise the sum of the token scores (exact 3, prefix or synonym 2, peeled/folded 1; see the file
 * header). An empty or stopword-only query scores 1 for any haystack.
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

interface Hit {
  task: Task;
  /** Query tokens matched (the fallback's first key; every token in the strict pass). */
  matched: number;
  score: number;
}

const byRank = (a: Hit, b: Hit): number =>
  b.matched - a.matched || b.score - a.score || (b.task.completedAt ?? 0) - (a.task.completedAt ?? 0);

/**
 * Searches completed tasks over title, notes and the documentation (completion note, place,
 * contact). Open tasks are ignored. With an empty query it just filters.
 *  - Strict: the tasks matching EVERY query token, ranked by match quality (scoreQuery, best
 *    first), then newest completion (tasks without a completedAt last).
 *  - Fallback, only when the strict pass finds nothing: the tasks matching at least one of the
 *    meaningful tokens (2+ characters, stopwords already dropped), ranked by how many they match,
 *    then by the summed score, then newest completion. "מה הטלפון של האינסטלטור?" has no task with
 *    "טלפון" but still finds the one with the plumber.
 * Full ties keep their input order.
 */
export function searchDoneTasks(
  tasks: readonly Task[],
  query: string,
  filters: SearchFilters = {}
): Task[] {
  const wanted = compileQuery(query);
  const { categoryId, memberId } = filters;
  const candidates: { task: Task; hay: Form[] }[] = [];
  for (const t of tasks) {
    if (t.status !== 'done') continue;
    if (categoryId != null && t.categoryId !== categoryId) continue;
    if (memberId != null && t.completedBy !== memberId) continue;
    const text = [t.title, t.notes, t.completion?.note, t.completion?.place, t.completion?.contact]
      .filter(Boolean)
      .join(' ');
    candidates.push({ task: t, hay: haystackForms(text) });
  }

  const strict: Hit[] = [];
  for (const { task, hay } of candidates) {
    const score = scoreCompiled(hay, wanted);
    if (score > 0) strict.push({ task, matched: wanted.length, score });
  }
  if (strict.length > 0) return strict.sort(byRank).map((h) => h.task);

  const meaningful = wanted.filter((q) => q.raw.length >= FALLBACK_MIN_TOKEN);
  const partial: Hit[] = [];
  for (const { task, hay } of candidates) {
    const scores = meaningful.map((q) => tokenScore(q, hay)).filter((s) => s > 0);
    if (scores.length > 0) {
      partial.push({ task, matched: scores.length, score: scores.reduce((a, b) => a + b, 0) });
    }
  }
  return partial.sort(byRank).map((h) => h.task);
}
