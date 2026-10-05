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
  /** A request I sent that waits for their answer: "ביקשת מדני · מחכה לתשובה". */
  iRequestedWaiting: (name: string) => `ביקשת ${prefixed('מ', name)} · מחכה לתשובה`,
  /** A request between two other members, waiting: "מיכל ביקשה מדני" (the requester's form). */
  requestedBetween: (who: Person, to: string) =>
    `${who.displayName} ${form(who, 'ביקשה', 'ביקש', 'ביקש/ה')} ${prefixed('מ', to)}`,
  /** An accepted request, to its holder: "לבקשת מיכל". */
  atRequestOf: (name: string) => `לבקשת ${name}`,
  /** An accepted request, to the one who asked. */
  atMyRequest: 'לבקשתך',
  /** Answering a request to me: yes (the same words as taking a task)… */
  accept: gendered('אני לוקחת', 'אני לוקח', 'אני לוקח/ת'),
  /** …or a gentle no. */
  decline: 'לא מתאים לי',
  /** Snackbar after "לא מתאים לי". */
  declined: 'בסדר, המשימה תחכה שמישהו ייקח',
  urgent: 'דחוף',
  high: 'חשוב',
  owner: (name: string) => `אצל ${name}`,
  pending: 'ממתין לסנכרון',
  swipe: {
    done: 'בוצע',
    snooze: 'דחייה'
  }
} as const;
