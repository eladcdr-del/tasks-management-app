import { describe, expect, it } from 'vitest';
import { planFor, whenKeyOf } from './when';

// Sunday 4 Oct 2026: this week ends Saturday 10 Oct.
const today = '2026-10-04';

describe('when options', () => {
  it('maps the quick options to plans', () => {
    expect(planFor('today', today)).toEqual({ scheduledFor: today, weekPlan: false });
    expect(planFor('tomorrow', today)).toEqual({ scheduledFor: '2026-10-05', weekPlan: false });
    expect(planFor('week', today)).toEqual({ scheduledFor: '2026-10-10', weekPlan: true });
  });

  it('recognises a plan as one of the options', () => {
    for (const k of ['today', 'tomorrow', 'week'] as const) {
      expect(whenKeyOf(planFor(k, today), today)).toBe(k);
    }
    expect(whenKeyOf({ scheduledFor: null, weekPlan: false }, today)).toBeNull();
    expect(whenKeyOf({ scheduledFor: '2026-10-20', weekPlan: false }, today)).toBe('date');
    expect(whenKeyOf({ scheduledFor: '2026-10-17', weekPlan: true }, today)).toBe('date');
  });

  it('extends "השבוע" to next Saturday on Friday', () => {
    expect(planFor('week', '2026-10-09').scheduledFor).toBe('2026-10-17');
  });
});
