// owner: step 3.3 — only that step edits this file
// QuickAddSheet.

export const sheetQuickAdd = {
  title: 'משימה חדשה',
  inputLabel: 'מה צריך לעשות?',
  placeholder: 'למשל: להחזיר מכנסיים עד יום חמישי',
  add: 'הוספה',
  who: 'מי',
  added: 'נוסף ✓',
  /** Under the input while empty: what the smart parsing understands. */
  hint: 'אפשר לכתוב "מחר", "עד יום חמישי", "דחוף", "כל חודש"',
  parsedLabel: 'זוהה בטקסט',
  dismissChip: (label: string) => `ביטול הזיהוי: ${label}`,
  hardDeadline: 'מועד אחרון קשיח',
  /** A parsed chip whose field the user then picked explicitly. */
  overridden: 'הוחלף בבחירה שלך',
  pickers: 'פרטים נוספים (לא חובה)',
  addedTitle: (title: string) => `נוסף: ${title}`
} as const;
