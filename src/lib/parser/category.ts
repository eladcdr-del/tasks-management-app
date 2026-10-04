// Category detection for the quick-add parser (Blueprint §6, decision (a) and council M5).
// Keywords stay in the title; the category chip only points at one of them.

import type { CategoryId } from '$lib/domain/types';
import {
  CATEGORY_KEYWORDS,
  RETURNS_SIGNALS,
  RETURNS_VERB_VETOES,
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
  /** returns only (always true for it): a store, clothing or product word backs it. */
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

const STORE_RE = anywhere(RETURNS_SIGNALS.store);
const ITEM_RE = anywhere(RETURNS_SIGNALS.items);

const PRONOUN = '(?:לו|לה|לי|לך|לכם|לכן|להם|להן|לנו)';
/** "להחזיר (לו) (את) (ה)טלפון": the verb's object, after an optional pronoun and "את". */
const objectRe = (objects: readonly string[]): RegExp =>
  rx1(`^\\s+(?:${PRONOUN}\\s+)?(?:את\\s+)?ה?(?:${alt(objects)})${AFTER}`);
const VERB_VETOES = new Map(
  Object.entries(RETURNS_VERB_VETOES).map(([verb, v]) => [
    verb,
    { always: objectRe(v.always), liftable: objectRe(v.liftable) }
  ])
);

function prefixAllowed(kw: CategoryKeyword, prefix: string): boolean {
  if (kw.needsPrefix && ![...kw.needsPrefix].some((ch) => prefix.includes(ch))) return false;
  if (kw.badPrefix && [...kw.badPrefix].some((ch) => prefix.includes(ch))) return false;
  return !(kw.badPrefixEnd && prefix.endsWith(kw.badPrefixEnd));
}

interface KeywordHit {
  id: CategoryId;
  start: number;
  end: number;
}

/** Every keyword occurrence whose conditions hold and which lies outside the `blocked` spans. */
function keywordHits(text: string, blocked: readonly Span[], store: boolean): KeywordHit[] {
  const hits: KeywordHit[] = [];
  for (const { id, kw, re, needs, notAfter } of COMPILED) {
    if (needs && !needs.test(text)) continue;
    const vetoes = VERB_VETOES.get(kw.word);
    for (const h of scan(re, text)) {
      if (!prefixAllowed(kw, group(h.m, 1))) continue;
      if (notAfter?.test(lookback(text, h.start))) continue;
      // a keyword inside a phrase the parser consumed (or the user dismissed) is not a keyword:
      // "סופר" in "סופר דחוף" is an intensifier, not the supermarket
      if (blocked.some(([s, e]) => h.start < e && s < h.end)) continue;
      // "להחזיר טלפון" is "call back"; "להחליף סדינים" is "change the sheets"
      if (vetoes) {
        const rest = text.slice(h.end);
        if (vetoes.always.test(rest) || (!store && vetoes.liftable.test(rest))) continue;
      }
      hits.push({ id, start: h.start, end: h.end });
    }
  }
  return hits.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * The category of `text` (normalised), or null.
 * - `blocked`: spans of phrases taken by other fields (their words are not keywords);
 * - `isDismissed(start, end)`: true when the user dismissed the chip for that keyword; the next
 *   keyword then takes over.
 * Returns wins only with a strong signal (a store, clothing or product word); a returns word
 * without one is no category at all, while the other categories still apply ("להחליף מצבר" is car).
 */
export function findCategory(
  text: string,
  blocked: readonly Span[],
  isDismissed: (start: number, end: number) => boolean
): CategoryHit | null {
  const store = STORE_RE.test(text);
  const active = keywordHits(text, blocked, store).filter((h) => !isDismissed(h.start, h.end));

  const returnsHit = active.find((h) => h.id === 'returns');
  if (returnsHit && (store || ITEM_RE.test(text))) {
    return { id: 'returns', start: returnsHit.start, end: returnsHit.end, strong: true };
  }
  for (const { id } of CATEGORY_KEYWORDS) {
    if (id === 'returns') continue;
    const hit = active.find((h) => h.id === id);
    if (hit) return { id, start: hit.start, end: hit.end, strong: false };
  }
  return null;
}
