// Quick add's list mode: a pasted or typed list (a WhatsApp message, a notes-app checklist, a
// numbered list) becomes one item per line. Pure and deterministic. Each item then goes through
// parseQuickAdd exactly like a single quick add, so this module only cleans lines; it never reads
// dates, priorities or people out of them.
//
//   splitList('משימות לשבוע:\n1. לקנות חלב\n2. ☐ לתקן ברז מחר\n\n- לקנות חלב')
//   → { items: [{ text: 'לקנות חלב', lines: [1, 4] }, { text: 'לתקן ברז מחר', lines: [2] }],
//       overflow: [] }
//
// Rules
//   - one item per line (\n, \r\n, \r, U+2028, U+2029); commas stay inside the item;
//   - invisible bidi and format marks (LRM, RLM, isolates, BOM, zero-width space…) are dropped and
//     any run of spaces (tabs, NBSP…) becomes one space;
//   - the header of a copied WhatsApp message ("[9:15, 4.10.2026] מיכל: ") goes, and so do *bold*,
//     _italic_ and ~strike~ marks wrapped around the whole line;
//   - leading list markers go, repeatedly ("1. ☐ לקנות" → "לקנות"): bullets (- * • · – — ▪ ◦ ➤ →…),
//     numbers ("1." "1)" "(1)" "1 -" "1️⃣"), Hebrew or Latin letters followed by a space ("א. " "b) "),
//     checkboxes (☐ ☑ ✅ ✔ ✓ ❌ "[ ]" "[x]") and emoji bullets ("🧹 לנקות");
//   - a line with no letter or digit left ("---", "***", "🎉") is ignored, and so is a heading: a
//     line that ends with ":" ("קניות:");
//   - the same item twice (ignoring case, spacing and a trailing full stop) is kept once, at its
//     first position; `lines` lists every input line it came from;
//   - an item is clipped to TITLE_MAX characters (a task title's limit);
//   - at most `max` items (LIST_MAX); the rest come back in `overflow`, in order.

/** The most tasks one list adds at once. */
export const LIST_MAX = 50;
/** A task title's length limit (firestore.rules, validate.ts). */
export const TITLE_MAX = 200;

export interface ListItem {
  /** The cleaned line: markers, checkboxes and odd spacing gone. Parse it with parseQuickAdd. */
  text: string;
  /** The 0-based input lines it came from (more than one when the same item was repeated). */
  lines: number[];
}

export interface SplitResult {
  /** At most `max` items, in input order. */
  items: ListItem[];
  /** The items past the cap, in input order. */
  overflow: ListItem[];
}

const LINE_BREAK_RE = /\r\n|\r|\n|\u2028|\u2029/;
/** Invisible marks that only steer direction or wrapping. ZWJ / ZWNJ stay (emoji sequences). */
const INVISIBLE_RE =
  /[\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const SPACES_RE = /\s+/g;
const HAS_WORD_RE = /[\p{L}\p{N}]/u;

/** "[9:15, 4.10.2026] מיכל: " (copied messages) or "4.10.2026, 9:15 - מיכל: " (an export). */
const WHATSAPP_HEADER_RE = new RegExp(
  '^(?:\\[[^\\]]{0,30}\\d{1,2}:\\d{2}[^\\]]{0,30}\\]\\s*' +
    '|\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s?[AaPp]\\.?[Mm]\\.?)?\\s+[-–]\\s+)' +
    '[^:\\d\\s][^:]{0,39}:\\s*',
  'u'
);
/** *bold*, _italic_ or ~strike~ around the whole line (WhatsApp formatting). */
const WRAPPED_RE = /^([*_~])(?=\S)(.*\S)\1$/u;

const EMOJI = '(?:\\p{Extended_Pictographic}|\\p{Regional_Indicator})';
const EMOJI_TAIL = '(?:[\\u{FE0E}\\u{FE0F}\\u{20E3}\\u{1F3FB}-\\u{1F3FF}]|\\u{200D}' + EMOJI + ')*';
const BULLETS = '[-*+>•‣⁃∙·‧◦○●■□▪▫◆◇►▸▹▶➢➣➤➔→⇒✓✗✘–—\\u2190-\\u21FF\\u25A0-\\u25FF\\u2794-\\u27BF]';

/** One leading marker (and the spaces after it). Tried again and again until none is left. */
const MARKER_RE = new RegExp(
  '^(?:' +
    [
      // checkboxes typed as text: [ ] [x] [X] [v] [✓] []
      '\\[\\s?[xXvV✓✔✗✘*-]?\\s?\\]',
      // keycap numbers: 1️⃣ #️⃣
      '[0-9#*]\\u{FE0F}?\\u{20E3}',
      // 1. 1) (1) 12] 3: — but not "1.5 ליטר" or "10.10"
      '\\(?\\d{1,3}\\s?[.)\\]:](?!\\d)',
      // 1 - / 1– (a dash after a number needs a space after it: "3-4 ביצים" stays)
      '\\d{1,3}\\s?[-–—](?=\\s)',
      // א. / ב) / a. / b) followed by a space
      '[א-תa-zA-Z][.)](?=\\s)',
      BULLETS + '[\\u{FE0E}\\u{FE0F}]?',
      EMOJI + EMOJI_TAIL
    ].join('|') +
    ')\\s*',
  'u'
);

/** Cleans one input line. Returns '' for a line that holds no task. */
export function cleanLine(line: string): string {
  let s = line.replace(INVISIBLE_RE, '').replace(SPACES_RE, ' ').trim();
  s = s.replace(WHATSAPP_HEADER_RE, '');
  // Every step removes at least one character, so this ends.
  for (;;) {
    const next = s.replace(WRAPPED_RE, '$2').trim().replace(MARKER_RE, '').trim();
    if (next === s) break;
    s = next;
  }
  if (!HAS_WORD_RE.test(s)) return '';
  if (s.endsWith(':')) return ''; // a heading ("קניות:")
  return clip(s, TITLE_MAX);
}

/** Splits a list into task lines (see the header for the rules). */
export function splitList(raw: string, max: number = LIST_MAX): SplitResult {
  const all: ListItem[] = [];
  const byKey = new Map<string, ListItem>();
  raw.split(LINE_BREAK_RE).forEach((line, index) => {
    const text = cleanLine(line);
    if (!text) return;
    const key = dedupeKey(text);
    const seen = byKey.get(key);
    if (seen) {
      seen.lines.push(index);
      return;
    }
    const item = { text, lines: [index] };
    byKey.set(key, item);
    all.push(item);
  });
  const cap = Math.max(0, Math.floor(max));
  return { items: all.slice(0, cap), overflow: all.slice(cap) };
}

/** True when `raw` holds two or more lines with words: a paste that should become a list. */
export function isMultiLine(raw: string): boolean {
  let lines = 0;
  for (const line of raw.split(LINE_BREAK_RE)) {
    if (HAS_WORD_RE.test(line) && ++lines >= 2) return true;
  }
  return false;
}

/** `raw` without the given 0-based lines (the × on a preview row). Line breaks become "\n". */
export function removeLines(raw: string, lines: readonly number[]): string {
  const drop = new Set(lines);
  return raw
    .split(LINE_BREAK_RE)
    .filter((_, i) => !drop.has(i))
    .join('\n');
}

function dedupeKey(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s.,;!…]+$/u, '');
}

/** The first `max` UTF-16 units, never splitting a surrogate pair, trimmed. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return text.slice(0, end).trim();
}
