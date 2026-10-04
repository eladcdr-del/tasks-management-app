// owner: step 1.4 — only that step edits this file
//
// Strings SHIPPED inside the UI primitives of src/components/ui/* (step 1.4): e.g. Stepper
// increase/decrease labels, Chip "remove" label, SyncIndicator labels (synced / pending / offline),
// BottomSheet drag-handle label, Snackbar action, Dialog defaults, Spinner/Skeleton "loading".
// Anything a production component renders goes HERE (he.ui.*), not in dev.ts.
// Dev-gallery-only copy (section titles, sample text) goes in dev.ts.
// Note for the merge of step 1.4: keys 1.4 added to the old `dev` block of he.ts that are used by
// primitives are re-homed here by the orchestrator.

import type { MemberColor } from '$lib/domain/types';

export const ui = {
  remove: (label: string) => `הסרת ${label}`,
  unassigned: 'עדיין לא נלקחה',
  andMore: (n: number) => `ועוד ${n}`,
  increase: 'הוספה',
  decrease: 'הפחתה',
  markDone: (title: string) => `סימון כבוצעה: ${title}`,
  currency: '₪',
  /** Banner × button. */
  dismiss: 'סגירת ההודעה',
  /** PickerChip with no value yet: "מתי · בחירה". */
  choose: 'בחירה',
  /** ColorSwatchPicker: the Hebrew name of each member colour (its accessible name). */
  memberColors: {
    terracotta: 'טרקוטה',
    sage: 'מרווה',
    slate: 'כחול־אפור',
    plum: 'שזיף',
    ochre: 'חרדל',
    teal: 'טורקיז'
  } satisfies Record<MemberColor, string>,
  sync: {
    synced: 'הכל שמור',
    saving: 'שומר…',
    offline: 'אין רשת',
    pending: (n: number) => (n === 1 ? 'שינוי אחד ממתין' : `${n} שינויים ממתינים`)
  }
} as const;
