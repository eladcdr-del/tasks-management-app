// Quick add's list mode (QuickAddList): from the text in the box to the rows of the preview and the
// drafts they become. Pure: splitList cleans the lines, then every line goes through parseQuickAdd
// exactly like a single quick add, so a line gets the same chips and the same fields.
//
// A draft never names an owner: the app does not suggest who should do a task, so every task of a
// list waits for someone to take it (and none of them is a request, so none sends a push).

import type { TaskDraft } from '$lib/domain/types';
import { parseQuickAdd, type ParseMatch, type ParseResult } from '$lib/parser/quickAdd';
import { LIST_MAX, splitList, type ListItem } from '$lib/parser/splitList';

export interface ListRow {
  /** The cleaned line; unique within one list, so it keys the row. */
  key: string;
  item: ListItem;
  /** The title the task will get: the line minus the recognised phrases. */
  title: string;
  /** The chips under the row, as in the single quick add. */
  matches: ParseMatch[];
  draft: TaskDraft;
}

export interface ListRows {
  rows: ListRow[];
  /** The lines past LIST_MAX: they stay in the box for the next round. */
  overflow: ListItem[];
}

/** The draft a parsed line becomes: the same fields as a single quick add without explicit picks. */
export function draftFromParse(parsed: ParseResult, fallbackTitle: string): TaskDraft {
  const dueDate = parsed.dueDate ?? null;
  return {
    title: parsed.title.trim() || fallbackTitle,
    scheduledFor: parsed.scheduledFor ?? null,
    weekPlan: parsed.scheduledFor !== undefined && (parsed.weekPlan ?? false),
    dueDate,
    dueTime: parsed.dueTime ?? null,
    hardDeadline: dueDate ? (parsed.hardDeadline ?? false) : false,
    priority: parsed.priority ?? 'normal',
    categoryId: parsed.categoryId ?? null,
    // Whatever repeat the parser recognised, as a copy (never the parse result's own object).
    recurrence: parsed.recurrence ? { ...parsed.recurrence } : null,
    ownerId: null
  };
}

/** The preview of `raw` at `now` in `tz`: at most `max` rows, the rest as overflow. */
export function listRows(raw: string, now: Date, tz: string, max: number = LIST_MAX): ListRows {
  const { items, overflow } = splitList(raw, max);
  const rows = items.map((item): ListRow => {
    const parsed = parseQuickAdd(item.text, now, tz);
    const draft = draftFromParse(parsed, item.text);
    return { key: item.text, item, title: draft.title, matches: parsed.matches, draft };
  });
  return { rows, overflow };
}
