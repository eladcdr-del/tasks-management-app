// owner: step 3.2 — only that step edits this file
// TaskCard and the take / request actions shown on it.

import { form, gendered, type Addressee } from '../gender';
import { prefixed } from '../prefix';

type Person = Addressee & { readonly displayName: string };

export const taskCard = {
  take: gendered('אני לוקחת', 'אני לוקח', 'אני לוקח/ת'),
  request: 'לבקש מ…',
  /** Snackbar after a successful take. */
  taken: 'המשימה אצלך',
  /** TakeResult { ok: false }: someone was faster. Uses the taker's form. */
  takenBy: (who: Person) =>
    `${who.displayName} ${form(who, 'כבר לקחה', 'כבר לקח', 'כבר לקח/ה')} את המשימה`,
  takenBySomeone: 'מישהו כבר לקח את המשימה',
  /** "דני ביקש ממך" (the requester's form). */
  requestedOfMe: (who: Person) => `${who.displayName} ${form(who, 'ביקשה', 'ביקש', 'ביקש/ה')} ממך`,
  /** "ביקשת מדני" (Hebrew attaches the preposition; "ביקשת מ-Michal" before a Latin name). */
  iRequested: (name: string) => `ביקשת ${prefixed('מ', name)}`,
  urgent: 'דחוף',
  high: 'חשוב',
  owner: (name: string) => `אצל ${name}`,
  pending: 'ממתין לסנכרון',
  swipe: {
    done: 'בוצע',
    snooze: 'דחייה'
  }
} as const;
