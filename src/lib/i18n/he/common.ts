// owner: step 1.1 — only that step edits this file
// Shared words used across screens. Other steps request additions via the orchestrator.

import { gendered } from '../gender';

export const common = {
  appName: 'HomeCare',
  ok: 'אישור',
  cancel: 'ביטול',
  save: 'שמירה',
  close: 'סגירה',
  back: 'חזרה',
  next: 'המשך',
  skip: 'דילוג',
  done: 'סיום',
  undo: 'ביטול',
  edit: 'עריכה',
  delete: 'מחיקה',
  retry: 'נסו שוב',
  loading: 'טוען…',
  comingSoon: 'המסך הזה ייבנה בקרוב',
  you: gendered('את', 'אתה', 'את/ה')
} as const;
