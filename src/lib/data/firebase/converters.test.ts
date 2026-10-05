// The stored recurrence: written canonically, read defensively (docs/firestore-schema.md).
import { describe, expect, it } from 'vitest';
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import type { Task } from '../../domain/types';
import { recurrenceDoc, taskFromSnap } from './converters';

/** A minimal synced snapshot of a task document holding `recurrence`. */
function snapWith(recurrence: unknown): DocumentSnapshot<DocumentData> {
  const doc = { title: 'להשקות', status: 'open', recurrence };
  return {
    id: 't1',
    metadata: { hasPendingWrites: false },
    data: () => doc,
    get: (k: string) => (doc as Record<string, unknown>)[k]
  } as unknown as DocumentSnapshot<DocumentData>;
}
const read = (recurrence: unknown): Task['recurrence'] =>
  taskFromSnap(snapWith(recurrence)).recurrence;

describe('recurrenceDoc (writes)', () => {
  it('a plain rule keeps the shape older clients write: {freq} or {freq, anchor}', () => {
    expect(recurrenceDoc({ freq: 'weekly' })).toEqual({ freq: 'weekly' });
    expect(recurrenceDoc({ freq: 'monthly', anchor: '2026-10-31' })).toEqual({
      freq: 'monthly',
      anchor: '2026-10-31'
    });
    expect(recurrenceDoc({ freq: 'weekly', interval: 1, anchor: '2026-10-04' })).toEqual({
      freq: 'weekly',
      anchor: '2026-10-04'
    });
    expect(recurrenceDoc(null)).toBeNull();
  });

  it('writes interval and weekdays canonically, never an undefined key', () => {
    const doc = recurrenceDoc({
      freq: 'weekly',
      interval: 2,
      weekdays: [3, 0, 3],
      anchor: '2026-10-04'
    });
    expect(doc).toEqual({ freq: 'weekly', interval: 2, weekdays: [0, 3], anchor: '2026-10-04' });
    expect(recurrenceDoc({ freq: 'daily', interval: 3 })).toEqual({ freq: 'daily', interval: 3 });
    expect(recurrenceDoc({ freq: 'monthly', weekdays: [1] })).toEqual({ freq: 'monthly' });
    for (const v of Object.values(doc ?? {})) expect(v).not.toBeUndefined();
  });
});

describe('taskFromSnap recurrence (reads)', () => {
  it('reads documents written before interval and weekdays existed exactly as before', () => {
    expect(read({ freq: 'weekly' })).toEqual({ freq: 'weekly' });
    expect(read({ freq: 'monthly', anchor: '2026-01-31' })).toEqual({
      freq: 'monthly',
      anchor: '2026-01-31'
    });
    expect(read(null)).toBeNull();
    expect(read(undefined)).toBeNull();
  });

  it('reads interval and weekdays', () => {
    expect(read({ freq: 'weekly', interval: 2, weekdays: [0, 3], anchor: '2026-10-04' })).toEqual({
      freq: 'weekly',
      interval: 2,
      weekdays: [0, 3],
      anchor: '2026-10-04'
    });
    expect(read({ freq: 'daily', interval: 3 })).toEqual({ freq: 'daily', interval: 3 });
  });

  it('a malformed interval or weekdays reads as its default; nothing throws', () => {
    expect(read({ freq: 'daily', interval: 0 })).toEqual({ freq: 'daily' });
    expect(read({ freq: 'daily', interval: '2' })).toEqual({ freq: 'daily' });
    expect(read({ freq: 'weekly', weekdays: [9, 3, 3, 'x'] })).toEqual({
      freq: 'weekly',
      weekdays: [3]
    });
    expect(read({ freq: 'weekly', weekdays: 'mon' })).toEqual({ freq: 'weekly' });
    expect(read({ freq: 'monthly', weekdays: [1] })).toEqual({ freq: 'monthly' });
    expect(read({ interval: 2 })).toBeNull();
  });
});
