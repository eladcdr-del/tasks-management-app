// Hebrew-aware search over the house memory (Blueprint §3 "Domain rules", §7 Memory).
//
// Matching model: normalise both sides, split into tokens, and require every query token to match
// some haystack token. A query token matches a haystack token when, after optionally peeling up to
// two Hebrew prefix letters (ו ה ב ל מ ש כ) off EITHER side, the haystack token starts with the
// query token. "Starts with" (rather than "equals") is what makes partial typing work ("מצב" finds
// "מצבר"); exact equality is the special case.
//
// DECISION (inflections): there is no root or stem matching. "החלפנו" (we replaced) does not match
// "החלפת" (replacement of), so the query "החלפנו מצבר" does not find a task titled "החלפת מצבר".
// People searching the house memory remember the thing ("מצבר", "מוסך"), which does match; typing
// the stem ("החלפ") also matches. A shared-root heuristic would add false positives for little gain.

import type { CategoryId, Task } from './types';

const PREFIX_LETTERS = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ']);
const MAX_PREFIX_LETTERS = 2;
/** A peeled word must keep at least this many letters (keeps "ב" + "בית" but not "ה" -> ""). */
const MIN_REMAINDER = 2;

// Final letters and their regular forms, position for position (ך→כ ם→מ ן→נ ף→פ ץ→צ).
const FINAL_FORMS = 'ךםןףץ';
const REGULAR_FORMS = 'כמנפצ';

// Zero-width characters and bidi controls that appear when text is pasted from chats.
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;
// Niqqud + cantillation (U+0591-U+05BD, U+05BF, U+05C1-2, U+05C4-5, U+05C7), without the maqaf/paseq/sof-pasuq punctuation.
const POINTS = /[֑-ׇֽֿׁׂׅׄ]/g;
// Hebrew punctuation that separates words: maqaf, paseq, sof pasuq, nun hafukha.
const HEBREW_SEPARATORS = /[־׀׃׆]/g;
// Geresh, gershayim and quote marks (ASCII and typographic): dropped, so פנצ'ר == פנצר and בסופ"ש == בסופש.
const QUOTES = /['"`´׳״‘-‟′″]/g;
const FINAL_LETTERS = new RegExp(`[${FINAL_FORMS}]`, 'g');
const NOT_WORD = /[^\p{L}\p{M}\p{N}]+/u;

/**
 * Canonical form for comparing Hebrew (and mixed) text: NFC; niqqud, cantillation, geresh,
 * gershayim and quotes removed; maqaf turned into a space; final letters folded (ך→כ ם→מ ן→נ ף→פ ץ→צ);
 * Latin lower-cased; whitespace collapsed and trimmed.
 */
export function normalizeHebrew(s: string): string {
  return s
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(POINTS, '')
    .replace(QUOTES, '')
    .replace(HEBREW_SEPARATORS, ' ')
    .replace(FINAL_LETTERS, (ch) => REGULAR_FORMS.charAt(FINAL_FORMS.indexOf(ch)))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalised words: split on everything that is not a letter, mark or digit. */
export function tokenize(s: string): string[] {
  return normalizeHebrew(s).split(NOT_WORD).filter(Boolean);
}

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

type Peeled = string[][];

const peel = (text: string): Peeled => tokenize(text).map(peelings);

function matchesPeeled(haystack: Peeled, query: Peeled): boolean {
  return query.every((queryForms) =>
    haystack.some((hayForms) => queryForms.some((q) => hayForms.some((h) => h.startsWith(q))))
  );
}

/**
 * Does `haystack` satisfy `query`? Every query token must match some haystack token (any order), with
 * prefix-letter peeling on either side and prefix matching for partial typing, see the file header.
 * An empty query (no tokens) matches everything.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  return matchesPeeled(peel(haystack), peel(query));
}

export interface SearchFilters {
  categoryId?: CategoryId | null;
  /** Matches the member who completed the task (`completedBy`). */
  memberId?: string | null;
}

/**
 * Searches completed tasks over title, notes and the documentation (completion note, place,
 * contact). Open tasks are ignored. With an empty query it just filters. Newest completion first
 * (tasks without a completedAt last); equal times keep their input order.
 */
export function searchDoneTasks(
  tasks: readonly Task[],
  query: string,
  filters: SearchFilters = {}
): Task[] {
  const wanted = peel(query);
  const { categoryId, memberId } = filters;
  return tasks
    .filter((t) => {
      if (t.status !== 'done') return false;
      if (categoryId != null && t.categoryId !== categoryId) return false;
      if (memberId != null && t.completedBy !== memberId) return false;
      const text = [
        t.title,
        t.notes,
        t.completion?.note,
        t.completion?.place,
        t.completion?.contact
      ]
        .filter(Boolean)
        .join(' ');
      return matchesPeeled(peel(text), wanted);
    })
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}
