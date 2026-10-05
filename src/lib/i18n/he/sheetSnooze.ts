// owner: step 3.2 — only that step edits this file
// SnoozeSheet.

import { prefixed } from '../prefix';

export const sheetSnooze = {
  title: 'דחייה',
  group: 'לדחות ל…',
  /** Gentle history line: "נדחתה פעמיים עד עכשיו". */
  history: (snoozed: string) => `${snoozed} עד עכשיו`,
  custom: 'תאריך אחר',
  customLabel: 'לאיזה תאריך?',
  confirm: 'לדחות לתאריך הזה',
  /** Hard deadline ahead: the picker stops at it. */
  maxHint: (day: string) => `המועד האחרון הוא ${day}, אפשר לדחות עד אז`,
  tooLate: 'התאריך הזה אחרי המועד האחרון',
  tooEarly: 'אפשר לבחור תאריך מחר והלאה',
  /** Snackbar: "נדחתה למחר" / "נדחתה ליום ה׳" / "נדחתה ל-15/10". */
  snoozed: (day: string) => `נדחתה ${prefixed('ל', day)}`,
  blocked: {
    title: 'היום הוא היום האחרון',
    body: 'מועד אחרון אי אפשר לדחות. אולי לעשות את זה היום, או לבקש עזרה?',
    /** Nobody else in the household yet: there is no one to ask. */
    bodyAlone: 'מועד אחרון אי אפשר לדחות. אולי לעשות את זה היום?',
    doIt: 'לסמן כבוצעה',
    askHelp: 'לבקש עזרה'
  },
  missing: 'המשימה הזו כבר לא פתוחה.'
} as const;
