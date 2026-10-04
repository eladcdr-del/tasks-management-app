// Category detection for the quick-add parser (Blueprint §6 + decision (a): strong and weak signals).
// Keywords stay in the title; the category chip only points at one of them.

import type { CategoryId } from '$lib/domain/types';
import {
  CATEGORY_KEYWORDS,
  SPECIFIC_NOUN_CATEGORIES,
  STORE_WORDS,
  alt,
  lit,
  type CategoryKeyword
} from './lexicon';
import { AFTER, ATTACHED, group, lastWordRe, lookback, rx1, rxg, scan, type Span } from './text';

export interface CategoryHit {
  id: CategoryId;
  /** Indices into the normalised text. */
  start: number;
  end: number;
  /** returns only: chosen because a store or clothing word backs it (allows the hard deadline). */
  strong: boolean;
}

interface CompiledKeyword {
  id: CategoryId;
  kw: CategoryKeyword;
  re: RegExp;
  needs: RegExp | null;
  notAfter: RegExp | null;
}

const LETTER_OR_DIGIT = '\\p{L}\\p{N}';
/** One of `words`, with 0–2 prefixes, as a whole word anywhere in the text. */
const anywhere = (words: readonly string[]): RegExp =>
  rx1(`(?:^|[^${LETTER_OR_DIGIT}])${ATTACHED}(?:${alt(words)})(?![${LETTER_OR_DIGIT}])`);

const ABBREV_MARK = '(?![\u{5F3}\'\u{2019}".])';

const COMPILED: readonly CompiledKeyword[] = CATEGORY_KEYWORDS.flatMap(({ id, keywords }) =>
  keywords.map((kw) => {
    const tail = kw.notAbbrev ? ABBREV_MARK : '';
    const veto = kw.notBefore ? `(?!\\s+(?:${alt(kw.notBefore)})${AFTER})` : '';
    return {
      id,
      kw,
      re: rxg(`(${ATTACHED})(?:${lit(kw.word)})${AFTER}${tail}${veto}`),
      needs: kw.needs ? anywhere(kw.needs) : null,
      notAfter: kw.notAfter ? lastWordRe(kw.notAfter) : null
    };
  })
);

const STORE_RE = anywhere(STORE_WORDS);
const SPECIFIC = new Set<CategoryId>(SPECIFIC_NOUN_CATEGORIES);

function prefixAllowed(kw: CategoryKeyword, prefix: string): boolean {
  if (kw.needsPrefix && ![...kw.needsPrefix].some((ch) => prefix.includes(ch))) return false;
  if (kw.badPrefix && [...kw.badPrefix].some((ch) => prefix.includes(ch))) return false;
  return !(kw.badPrefixEnd && prefix.endsWith(kw.badPrefixEnd));
}

interface KeywordHit {
  id: CategoryId;
  start: number;
  end: number;
  verb: boolean;
}

/** Every keyword occurrence whose conditions hold and which lies outside the `blocked` spans. */
function keywordHits(text: string, blocked: readonly Span[]): KeywordHit[] {
  const hits: KeywordHit[] = [];
  for (const { id, kw, re, needs, notAfter } of COMPILED) {
    if (needs && !needs.test(text)) continue;
    for (const h of scan(re, text)) {
      if (!prefixAllowed(kw, group(h.m, 1))) continue;
      if (notAfter?.test(lookback(text, h.start))) continue;
      // a keyword inside a phrase the parser consumed (or the user dismissed) is not a keyword:
      // "סופר" in "סופר דחוף" is an intensifier, not the supermarket
      if (blocked.some(([s, e]) => h.start < e && s < h.end)) continue;
      hits.push({ id, start: h.start, end: h.end, verb: kw.verb === true });
    }
  }
  return hits.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * The category of `text` (normalised), or null.
 * - `blocked`: spans of phrases taken by other fields (their words are not keywords);
 * - `isDismissed(start, end)`: true when the user dismissed the chip for that keyword; the next
 *   keyword then takes over. A dismissed noun still counts as present when deciding whether a weak
 *   returns verb may win ("להחליף מצבר" without the car chip has no category, not returns).
 */
export function findCategory(
  text: string,
  blocked: readonly Span[],
  isDismissed: (start: number, end: number) => boolean
): CategoryHit | null {
  const all = keywordHits(text, blocked);
  const active = all.filter((h) => !isDismissed(h.start, h.end));

  const returnsHit = active.find((h) => h.id === 'returns');
  if (returnsHit) {
    const strong = STORE_RE.test(text);
    const specificNoun = all.some((h) => SPECIFIC.has(h.id) && !h.verb);
    if (strong || !specificNoun) {
      return { id: 'returns', start: returnsHit.start, end: returnsHit.end, strong };
    }
  }
  for (const { id } of CATEGORY_KEYWORDS) {
    if (id === 'returns') continue;
    const hit = active.find((h) => h.id === id);
    if (hit) return { id, start: hit.start, end: hit.end, strong: false };
  }
  return null;
}
