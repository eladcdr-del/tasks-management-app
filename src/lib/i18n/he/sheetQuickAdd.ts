// owner: step 3.3 — only that step edits this file
// QuickAddSheet.

import { formatNumber, pluralTasks } from '../format';

export const sheetQuickAdd = {
  title: 'משימה חדשה',
  inputLabel: 'מה צריך לעשות?',
  placeholder: 'למשל: להחזיר מכנסיים עד יום חמישי',
  add: 'הוספה',
  who: 'מי',
  added: 'נוסף ✓',
  /** Under the input while empty: what the smart parsing understands. */
  hint: 'אפשר לכתוב "מחר", "עד יום חמישי", "דחוף", "כל שני וחמישי"',
  parsedLabel: 'זוהה בטקסט',
  dismissChip: (label: string) => `ביטול הזיהוי: ${label}`,
  hardDeadline: 'מועד אחרון קשיח',
  /** A parsed chip whose field the user then picked explicitly. */
  overridden: 'הוחלף בבחירה שלך',
  pickers: 'פרטים נוספים (לא חובה)',
  addedTitle: (title: string) => `נוסף: ${title}`,
  /** List mode: many tasks at once, one per line (QuickAddList). */
  list: {
    /** The way in, under the sheet's title. */
    open: 'הוספת כמה משימות בבת אחת',
    title: 'כמה משימות בבת אחת',
    /** The way back to a single task. */
    back: 'חזרה למשימה אחת',
    inputLabel: 'רשימת המשימות',
    placeholder: 'לקנות חלב\nלתקן את הברז מחר\nלהחזיר ספרים לספרייה',
    hint: 'משימה בכל שורה. אפשר להדביק רשימה מוואטסאפ או מהפתקים',
    /** A multi-line paste into the single input switched to the list. */
    pasted: 'הדבקת רשימה, אז כל שורה תהיה משימה נפרדת',
    previewLabel: 'המשימות שיתווספו',
    /** The × on a preview row. */
    drop: (title: string) => `הסרה מהרשימה: ${title}`,
    /** The primary button: "הוספת משימה אחת" / "הוספת 12 משימות". */
    add: (n: number) => (n > 0 ? `הוספת ${pluralTasks(n)}` : 'הוספת משימות'),
    /** Snackbar after adding: "נוספה משימה אחת" / "נוספו 12 משימות". */
    added: (n: number) => (n === 1 ? 'נוספה משימה אחת' : `נוספו ${formatNumber(n)} משימות`),
    /** Past the cap: the rest stay in the box for the next round. */
    tooMany: (max: number, rest: number) =>
      `אפשר להוסיף עד ${formatNumber(max)} משימות בבת אחת. ${
        rest === 1 ? 'משימה אחת נוספת תחכה' : `עוד ${formatNumber(rest)} משימות יחכו`
      } כאן לפעם הבאה`,
    /** In the sheet after a capped round: the rest are waiting in the box. */
    addedSome: (n: number, rest: number) =>
      `${n === 1 ? 'נוספה משימה אחת' : `נוספו ${formatNumber(n)} משימות`}. ${
        rest === 1 ? 'נשארה עוד אחת' : `נשארו עוד ${formatNumber(rest)}`
      }`
  }
} as const;
