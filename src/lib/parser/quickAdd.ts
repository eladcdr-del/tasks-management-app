// HomeCare Hebrew quick-add parser (Blueprint §6, round 2 after the step 1.3 assessment).
//
// Turns free text such as "להחזיר מכנסיים עד יום חמישי" into a clean title plus optional structured
// fields and one chip per recognised phrase. Local, deterministic, never throws; if nothing is
// recognised the input is the title. The governing rule: a wrong chip is worse than no chip.
//
// Pipeline
//   1. normalise: NFC, drop niqqud, treat maqaf / hyphens / bidi marks as spaces, collapse whitespace,
//      keeping a per-character map back to offsets in the ORIGINAL input (text.ts);
//   2. find candidates (dates, "עד" deadlines, times, priority, recurrence) and veto the ones that
//      are something else: addresses, fractions, "בראשון לציון", "סדר היום", scores… (candidates.ts);
//   3. resolve overlaps (earliest start wins, then the longest), so a dismissed phrase keeps its text;
//   4. drop the candidates whose chip the user dismissed (opts.dismissed), THEN pick at most one
//      candidate per field (the leftmost; priority takes the highest level), so the next candidate
//      can take over and fields, hardDeadline and title always agree;
//   5. detect the category, strong or weak (category.ts; keywords stay in the title);
//   6. build the chips (key, field, value, Hebrew label) and the title: the original input minus the
//      consumed phrases, tidied.
//
// No owner/member parsing: the app never infers who does a task.

import { weekHorizon } from '$lib/domain/buckets';
import { addDays, DEFAULT_TZ } from '$lib/domain/dates';
import type { CategoryId, ISODate, Priority, RecurrenceFreq } from '$lib/domain/types';
import {
  collectDateHits,
  collectTimeHits,
  dateCandidates,
  hardCandidates,
  LEVEL_RANK,
  namesUnparsedDay,
  priorityCandidates,
  recurrenceCandidates,
  resolveClock,
  resolveRangeEnd,
  timeCandidates,
  timeCue,
  type Cand,
  type CandKind,
  type Ctx
} from './candidates';
import { findCategory } from './category';
import {
  categoryLabel,
  dateLabel,
  dueLabel,
  priorityLabel,
  recurrenceLabel,
  timeLabel,
  weekPlanLabel
} from './labels';
import { SHIN_WORDS_NOT_CLAUSE } from './lexicon';
import {
  buildTitle,
  collapse,
  normalize,
  stripReminderLead,
  WORD_CHAR_RE,
  type Span
} from './text';
import { clockAt } from './util';

// ───────────────────────────── public contract ─────────────────────────────

export type MatchKind = 'date' | 'due' | 'time' | 'priority' | 'category' | 'recurrence';
/** The ParseResult field a chip sets. */
export type MatchField =
  | 'scheduledFor'
  | 'dueDate'
  | 'dueTime'
  | 'hardDeadline'
  | 'priority'
  | 'categoryId'
  | 'recurrence';

/** A span of the ORIGINAL input (UTF-16 offsets). */
export interface MatchSpan {
  start: number;
  end: number;
  text: string;
}

interface MatchBase extends MatchSpan {
  /**
   * `${kind}:${normalisedText}`: stable while the user keeps typing elsewhere in the line (offsets,
   * extra spaces, hyphens and niqqud do not change it). Pass it in `opts.dismissed` to drop the chip.
   */
  key: string;
  /** The chip text, e.g. "מחר · יום ב׳ 5/10", "עד יום ה׳ 8/10", "17:30", "דחוף", "רכב", "כל שבוע". */
  label: string;
  /** due chips only: the deadline is hard ("מועד אחרון", or a strong returns category + "עד"). */
  hard?: boolean;
  /** More text consumed by this chip: a "מועד אחרון" detached from its date. */
  extra?: MatchSpan[];
  /**
   * A second field this phrase sets: the date a lone time implies, the first day of "כל יום ג׳", or
   * this week's plan for a weekly repeat with no day ("כל שבוע": `weekPlan: true`).
   */
  alsoSets?: { scheduledFor: ISODate; weekPlan?: true };
  /** date chips only: a week plan ("השבוע", "בשבוע הבא"); `value` is the Saturday that ends it. */
  weekPlan?: true;
}

export type ParseMatch =
  | (MatchBase & { kind: 'date'; field: 'scheduledFor'; value: ISODate })
  | (MatchBase & { kind: 'due'; field: 'dueDate'; value: ISODate })
  /** @deprecated Never produced since the Phase 1 council: a hard deadline needs a date. */
  | (MatchBase & { kind: 'due'; field: 'hardDeadline'; value: true })
  | (MatchBase & { kind: 'time'; field: 'dueTime'; value: string })
  | (MatchBase & { kind: 'priority'; field: 'priority'; value: Exclude<Priority, 'normal'> })
  | (MatchBase & { kind: 'category'; field: 'categoryId'; value: CategoryId })
  | (MatchBase & { kind: 'recurrence'; field: 'recurrence'; value: { freq: RecurrenceFreq } });

export interface ParseResult {
  title: string; // input minus consumed phrases, whitespace/punctuation tidied; never empty (falls back to raw)
  scheduledFor?: ISODate;
  /** true when scheduledFor is a week plan ("השבוע", "בשבוע הבא", "כל שבוע" with no day). */
  weekPlan?: boolean;
  dueDate?: ISODate;
  dueTime?: string;
  hardDeadline?: boolean;
  priority?: Priority;
  categoryId?: CategoryId;
  recurrence?: { freq: RecurrenceFreq };
  /** One chip per recognised phrase, sorted by position. */
  matches: ParseMatch[];
}

export interface ParseOptions {
  /** Keys (ParseMatch.key) of the chips the user dismissed: those phrases stay in the title. */
  dismissed?: readonly string[];
}

/**
 * Parses `input` (a quick-add line) relative to `now` in `tz`. Never throws.
 *
 * The UI keeps the keys of the chips the user dismissed and passes them back on every keystroke:
 *
 *   const r = parseQuickAdd(text, new Date(), 'Asia/Jerusalem', { dismissed: [...dismissedKeys] });
 *   // render r.matches as chips (m.label, m.hard); on ✕: dismissedKeys.add(m.key) and re-parse
 *   // save: { title: r.title, scheduledFor: r.scheduledFor, dueDate: r.dueDate, … }
 *
 * A dismissed phrase goes back into the title and the next candidate may take over its field
 * ("מחר או ביום שלישי" without the מחר chip is Tuesday).
 *
 * Ambiguities, resolved deterministically (all covered by tests):
 * - A named weekday is the next occurrence STRICTLY after today. "ביום X בשבוע הבא" is X of next
 *   (Sunday–Saturday) week. A bare name is a date only after עד, or after ב at the end of the line,
 *   before punctuation, a time, a date or a part-of-day word ("בשני תשלומים" is not Monday).
 * - "השבוע" is a week plan ending weekHorizon(today): this Saturday, or next Saturday on
 *   Friday/Saturday. "בשבוע הבא" is a week plan ending next week's Saturday; "כל שבוע" with no day
 *   is this week's plan. After "עד" they are plain due dates ("עד השבוע הבא" = next Sunday).
 *   "סוף השבוע" / "בסופ"ש" is the coming Friday (today, if today is Friday: decision (f)).
 *   "בעוד שבוע" is today + 7.
 * - A date with no year up to 14 days back stays this year (overdue); older rolls to next year.
 *   An un-introduced dd/mm more than 120 days ahead, a fraction, a decimal, or a number after
 *   "דירה / מידה / ציון / גרסה…" or a Latin word is not a date.
 * - A time with no date is today if still ahead of `now`, else tomorrow (a range: always today),
 *   unless the line names a day it did not parse ("ארוחת שישי 19:30") or a date chip was dismissed:
 *   then it is no time at all and stays in the title, as does a time with only a week plan. With a
 *   plan and a deadline, a time is read only right after the deadline ("עד יום חמישי ב-17:00").
 *   An unpadded hour 1–5 is afternoon; an unpadded 6 or 7 needs a part of day or a cue word, else
 *   it is no time at all.
 * - "עד <date>" (or "מועד אחרון <date>", "לא יאוחר מ<date>") sets dueDate instead of scheduledFor;
 *   "לפני <date>" sets dueDate to the day before. "מועד אחרון" without a date is not parsed.
 * - Only the first phrase per field is consumed; a second date etc. stays in the title.
 */
export function parseQuickAdd(
  input: string,
  now: Date,
  tz: string = DEFAULT_TZ,
  opts: ParseOptions = {}
): ParseResult {
  const raw = typeof input === 'string' ? input : '';
  try {
    return parseUnsafe(raw, now, tz, new Set(opts?.dismissed ?? []));
    /* v8 ignore start -- safety net: the fuzz tests assert it is never reached */
  } catch {
    return { title: collapse(raw), matches: [] };
  }
  /* v8 ignore stop */
}

type Consumable = Pick<ParseMatch, 'kind' | 'start' | 'end'> & { extra?: readonly MatchSpan[] };

/**
 * The title for `input` when exactly `matches` are consumed from it (category matches are never
 * consumed: their words belong to the title; `extra` spans are). A leading "תזכיר לי" is dropped.
 * Falls back to the raw input when no word is left. The parser's own title is
 * `rebuildTitle(input, result.matches)`.
 */
export function rebuildTitle(input: string, matches: readonly Consumable[]): string {
  const ranges: Span[] = [];
  for (const m of matches) {
    if (m.kind === 'category') continue;
    ranges.push([m.start, m.end]);
    for (const x of m.extra ?? []) ranges.push([x.start, x.end]);
  }
  const title = stripReminderLead(buildTitle(input, ranges));
  // nothing but punctuation left ("עד מחר!" → "!"): the raw input is the better title
  return WORD_CHAR_RE.test(title) ? title : collapse(input);
}

/** Offsets of `span` in `input`, re-located by its text when stale; null when the text is gone. */
function locate(input: string, span: MatchSpan): Span | null {
  if (span.text && input.slice(span.start, span.end) === span.text) return [span.start, span.end];
  const start = span.text ? input.indexOf(span.text) : -1;
  return start < 0 ? null : [start, start + span.text.length];
}

/**
 * Edits the INPUT: `input` with the text of `match` (and its `extra` spans) deleted and tidied (no
 * stray spaces, commas, dashes or dangling "עד"), so that re-parsing it no longer produces that
 * chip. The offsets are checked against `match.text`; a stale match is located by its text instead.
 *
 * For dismissing a chip, the UI should NOT edit the input: pass the chip's key in
 * `opts.dismissed` instead, which keeps the user's words and lets fields and title stay in sync.
 */
export function deletePhraseFromInput(
  input: string,
  match: MatchSpan & { extra?: readonly MatchSpan[] }
): string {
  const ranges = [match, ...(match.extra ?? [])]
    .map((span) => locate(input, span))
    .filter((r): r is Span => r !== null);
  return buildTitle(input, ranges);
}

/** @deprecated Renamed to `deletePhraseFromInput`; to dismiss a chip use `opts.dismissed`. */
export const removeMatch = deletePhraseFromInput;

// ───────────────────────────── selection ─────────────────────────────

const OUT_KIND: Record<CandKind, Exclude<MatchKind, 'category'>> = {
  date: 'date',
  due: 'due',
  hard: 'due',
  time: 'time',
  priority: 'priority',
  recurrence: 'recurrence'
};

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

const SHIN_OK = new Set(SHIN_WORDS_NOT_CLAUSE);
const SHIN_WORD_RE = /(?:^|\s)(ש\p{L}*)/gu;

/** Where the first ש-clause at or after `from` starts ("שמחר", "שהאסיפה"), or Infinity. */
function shinClause(text: string, from: number): number {
  SHIN_WORD_RE.lastIndex = from === 0 ? 0 : from - 1;
  for (let m = SHIN_WORD_RE.exec(text); m; m = SHIN_WORD_RE.exec(text)) {
    const word = m[1] ?? '';
    if (!SHIN_OK.has(word)) return m.index + m[0].length - word.length;
  }
  return Infinity;
}

function topPriority(cands: readonly Cand[]): Cand | undefined {
  let best: Cand | undefined;
  for (const c of cands) {
    if (!c.priority) continue;
    if (!best?.priority || LEVEL_RANK[c.priority] > LEVEL_RANK[best.priority]) best = c;
  }
  return best;
}

// ───────────────────────────── the parser ─────────────────────────────

function parseUnsafe(
  input: string,
  now: Date,
  tz: string,
  dismissed: ReadonlySet<string>
): ParseResult {
  const norm = normalize(input);
  const text = norm.text;
  const { today, minutes } = clockAt(now, tz);
  const ctx: Ctx = { input, norm, text, today };

  const dateHits = collectDateHits(ctx);
  const timeHits = collectTimeHits(text);
  const phraseStarts = new Set([...dateHits, ...timeHits].map((h) => h.start));
  const dateEnds = new Set(dateHits.map((h) => h.end));
  const kept = resolveOverlaps([
    ...dateCandidates(ctx, dateHits, phraseStarts),
    ...hardCandidates(text),
    ...timeCandidates(ctx, timeHits, phraseStarts, dateEnds),
    ...priorityCandidates(text),
    ...recurrenceCandidates(ctx, phraseStarts)
  ]); // already sorted by start

  const keyOf = (kind: MatchKind, start: number, end: number) =>
    `${kind}:${text.slice(start, end)}`;
  const isOff = (c: Cand, kind: MatchKind = OUT_KIND[c.kind]) =>
    dismissed.has(keyOf(kind, c.start, c.end));
  /**
   * The first live candidate of `kind`. A dismissed date never promotes one inside a ש-clause after
   * it ("מחר להזכיר לדני שמחר יש אסיפה" without the first מחר has no date).
   */
  const first = (kind: CandKind, skip?: Cand) => {
    let blockFrom = Infinity;
    for (const c of kept) {
      if (c.kind !== kind || c === skip || c.void) continue;
      if (isOff(c)) {
        if (kind === 'date' || kind === 'due')
          blockFrom = Math.min(blockFrom, shinClause(text, c.end));
        continue;
      }
      return c.start >= blockFrom ? undefined : c;
    }
    return undefined;
  };

  let date = first('date');
  let due = first('due');
  let hard = first('hard');
  // "מועד אחרון" is a modifier of the one due chip. Dismissing that chip dismisses the modifier too.
  if (hard) {
    const firstDue = kept.find((c) => c.kind === 'due' && !c.void);
    if (firstDue) {
      if (isOff(firstDue)) hard = undefined;
    } else if (date && !date.week) {
      // "מועד אחרון" with a plain date elsewhere: that date is the deadline
      if (isOff(date, 'due')) {
        hard = undefined;
        date = first('date', date);
      } else {
        due = { ...date, kind: 'due', intro: 'hard' };
        date = undefined;
      }
    }
  }
  // a hard deadline needs a date: "מועד אחרון" alone is no chip and stays in the title
  if (!due) hard = undefined;
  const time = first('time');
  const recurrence = first('recurrence');
  const priority = topPriority(kept.filter((c) => c.kind === 'priority' && !isOff(c)));

  // Words inside any kept phrase (dismissed or not) are not keywords: "סופר" in "סופר דחוף".
  const category = findCategory(
    text,
    kept.filter((c) => !c.void).map((c): Span => [c.start, c.end]),
    (start, end) => dismissed.has(keyOf('category', start, end))
  );

  // Only a STRONG returns signal (a store or clothing word) makes "עד" a hard deadline (M2).
  const hardDeadline =
    due !== undefined && (due.intro === 'hard' || hard !== undefined || category?.strong === true);

  // scheduledFor: an explicit date, else the first day of "כל יום שלישי", else this week's plan for
  // a weekly repeat with no day, else the day a lone time implies (decision (d): today if the time
  // is still ahead, else tomorrow; a range is today)
  const recurrenceDate = !date && recurrence?.iso ? recurrence.iso : undefined;
  const weeklyPlan =
    !date && !due && recurrence?.freq === 'weekly' && !recurrence.iso
      ? weekHorizon(today)
      : undefined;
  // The day phrase a time belongs to. Right after "עד <date>" it is the deadline's time. With both a
  // plan and a deadline, a time elsewhere is the plan's, and the one dueTime field would show it as
  // the deadline's ("מחר ב-10 עד יום חמישי"), so it has no day. A week has no time of day.
  const timeAfterDue =
    time !== undefined &&
    due !== undefined &&
    time.start >= due.end &&
    /^,?\s*$/u.test(text.slice(due.end, time.start));
  let timeDay: Cand | undefined;
  if (due) timeDay = !date || timeAfterDue ? due : undefined;
  else if (date) timeDay = date.week ? undefined : date;
  else if (recurrenceDate) timeDay = recurrence;
  const dayPart = (timeDay ?? recurrence)?.dayPart;
  const cue = timeCue(text);
  const clock = time?.clock ? (resolveClock(time.clock, dayPart, cue) ?? undefined) : undefined;
  const endClock =
    clock && time?.endClock ? resolveRangeEnd(time.endClock, clock, dayPart, cue) : undefined;
  let impliedDate: ISODate | undefined;
  if (clock && time && !date && !due && !recurrenceDate && !weeklyPlan) {
    // a dismissed date, or a day the line names without a chip ("ארוחת שישי 19:30"): no date
    const dateOff = kept.some(
      (c) => (c.kind === 'date' || c.kind === 'due') && !c.void && isOff(c)
    );
    const consumed = [time, priority, recurrence]
      .filter((c): c is Cand => c !== undefined)
      .map((c): Span => [c.start, c.end]);
    if (!dateOff && !namesUnparsedDay(text, consumed)) {
      const [h, m] = clock.split(':').map(Number);
      impliedDate = endClock || (h ?? 0) * 60 + (m ?? 0) > minutes ? today : addDays(today, 1);
    }
  }
  // A time with no day would be saved where nothing shows it: it stays in the title (no chip).
  const dueTime = clock && (timeDay || impliedDate) ? clock : undefined;

  // ── chips ──
  const span = (start: number, end: number): MatchSpan => {
    const from = norm.starts[start] ?? 0;
    const to = norm.ends[end - 1] ?? input.length;
    return { start: from, end: to, text: input.slice(from, to) };
  };
  const base = (kind: MatchKind, c: { start: number; end: number }) => ({
    ...span(c.start, c.end),
    key: keyOf(kind, c.start, c.end)
  });
  const matches: ParseMatch[] = [];
  if (date?.iso) {
    matches.push({
      kind: 'date',
      ...base('date', date),
      field: 'scheduledFor',
      value: date.iso,
      label: date.week
        ? weekPlanLabel(date.week, date.iso, today)
        : dateLabel(date.iso, today, date.dayPart),
      ...(date.week ? { weekPlan: true as const } : {})
    });
  }
  if (due?.iso) {
    matches.push({
      kind: 'due',
      ...base('due', due),
      field: 'dueDate',
      value: due.iso,
      label: dueLabel(due.iso, today, due.dayPart),
      ...(hardDeadline ? { hard: true } : {}),
      ...(hard ? { extra: [span(hard.start, hard.end)] } : {})
    });
  }
  if (time && dueTime) {
    matches.push({
      kind: 'time',
      ...base('time', time),
      field: 'dueTime',
      value: dueTime,
      label: timeLabel(dueTime, impliedDate, today, endClock),
      ...(impliedDate ? { alsoSets: { scheduledFor: impliedDate } } : {})
    });
  }
  if (priority?.priority) {
    matches.push({
      kind: 'priority',
      ...base('priority', priority),
      field: 'priority',
      value: priority.priority,
      label: priorityLabel(priority.priority)
    });
  }
  if (category) {
    matches.push({
      kind: 'category',
      ...base('category', category),
      field: 'categoryId',
      value: category.id,
      label: categoryLabel(category.id)
    });
  }
  if (recurrence?.freq) {
    const alsoSets = recurrenceDate
      ? { scheduledFor: recurrenceDate }
      : weeklyPlan
        ? { scheduledFor: weeklyPlan, weekPlan: true as const }
        : undefined;
    matches.push({
      kind: 'recurrence',
      ...base('recurrence', recurrence),
      field: 'recurrence',
      value: { freq: recurrence.freq },
      label: recurrenceLabel(recurrence.freq, recurrenceDate, today, recurrence.dayPart),
      ...(alsoSets ? { alsoSets } : {})
    });
  }
  matches.sort((a, b) => a.start - b.start || a.end - b.end);

  const result: ParseResult = { title: rebuildTitle(input, matches), matches };
  const scheduledFor = date?.iso ?? recurrenceDate ?? weeklyPlan ?? impliedDate;
  if (scheduledFor) result.scheduledFor = scheduledFor;
  if (date?.week || (scheduledFor && scheduledFor === weeklyPlan)) result.weekPlan = true;
  if (due?.iso) result.dueDate = due.iso;
  if (dueTime) result.dueTime = dueTime;
  if (hardDeadline) result.hardDeadline = true;
  if (priority?.priority) result.priority = priority.priority;
  if (category) result.categoryId = category.id;
  if (recurrence?.freq) result.recurrence = { freq: recurrence.freq };
  return result;
}
