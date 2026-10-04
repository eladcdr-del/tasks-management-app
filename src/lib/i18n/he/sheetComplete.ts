// owner: step 3.3 — only that step edits this file
// CompleteSheet (completion + optional documentation).

export const sheetComplete = {
  title: 'כל הכבוד, עוד משימה ירדה מהרשימה',
  docSummary: 'להוסיף תיעוד?',
  docHint: 'הערה, עלות, מקום, איש קשר ותמונות. יעזור למצוא את זה בזיכרון הבית',
  note: 'הערה',
  notePlaceholder: 'מה נעשה, מה כדאי לזכור לפעם הבאה',
  cost: 'עלות',
  place: 'איפה',
  placePlaceholder: 'למשל: מוסך השרון, כפר סבא',
  contact: 'אצל מי',
  contactPlaceholder: 'שם וטלפון',
  photos: 'תמונות',
  finish: 'סיום',
  done: 'בוצע',
  doneNext: (when: string) => `בוצע · הבאה ${when}`,
  notFound: 'המשימה כבר לא קיימת'
} as const;
