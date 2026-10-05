// owner: step 3.2 — only that step edits this file
// RequestSheet ("לבקש מ…").

import { form, type Addressee } from '../gender';
import { prefixed } from '../prefix';

export const sheetRequest = {
  title: 'לבקש מ…',
  group: 'ממי לבקש?',
  send: 'שליחת הבקשה',
  /** Snackbar: "הבקשה נשלחה לדני" / "הבקשה נשלחה ל-Michal". */
  sent: (name: string) => `הבקשה נשלחה ${prefixed('ל', name)}`,
  /** Row subtitle of the member who already owns the task. */
  owns: (who: Addressee) => form(who, 'המשימה כבר אצלה', 'המשימה כבר אצלו', 'המשימה כבר אצלו/ה'),
  alone: 'עוד אין בבית מישהו נוסף. אפשר להזמין מהלשונית "הבית שלנו".',
  missing: 'המשימה הזו כבר לא פתוחה.'
} as const;
