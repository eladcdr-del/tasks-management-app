// owner: step 3.3. The "מתי" quick options (היום / מחר / השבוע / תאריך) as pure helpers, shared by
// WhenPicker (QuickAdd, TaskDetail) and the QuickAdd picker chip.

import { weekHorizon } from '$lib/domain/buckets';
import { addDays } from '$lib/domain/dates';
import type { ISODate } from '$lib/domain/types';

export interface PlanValue {
  scheduledFor: ISODate | null;
  weekPlan: boolean;
}

export type WhenKey = 'today' | 'tomorrow' | 'week' | 'date';

/** The plan a quick option stands for ("השבוع" = a week plan ending weekHorizon(today)). */
export function planFor(key: Exclude<WhenKey, 'date'>, today: ISODate): PlanValue {
  switch (key) {
    case 'today':
      return { scheduledFor: today, weekPlan: false };
    case 'tomorrow':
      return { scheduledFor: addDays(today, 1), weekPlan: false };
    case 'week':
      return { scheduledFor: weekHorizon(today), weekPlan: true };
  }
}

/** Which option a plan matches (null = no plan; 'date' = any other day or week). */
export function whenKeyOf(v: PlanValue, today: ISODate): WhenKey | null {
  if (v.scheduledFor === null) return null;
  if (v.weekPlan) return v.scheduledFor === weekHorizon(today) ? 'week' : 'date';
  if (v.scheduledFor === today) return 'today';
  if (v.scheduledFor === addDays(today, 1)) return 'tomorrow';
  return 'date';
}
