// owner: step 3.3 (Memory). Done tasks grouped by completion month ("אוקטובר 2026"), newest first.

import type { Task } from '$lib/domain/types';
import { formatMonthYear, monthKey } from '$lib/i18n/format';

export interface MonthGroup {
  key: string;
  label: string;
  tasks: Task[];
}

export function groupByMonth(list: readonly Task[]): MonthGroup[] {
  const sorted = [...list].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const groups: MonthGroup[] = [];
  for (const t of sorted) {
    const at = t.completedAt ?? t.updatedAt;
    const key = monthKey(at);
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = { key, label: formatMonthYear(at), tasks: [] };
      groups.push(g);
    }
    g.tasks.push(t);
  }
  return groups;
}
