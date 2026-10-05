// owner: step 3.3 — only that step edits this file
// TaskDetail screen (#/task/:id) and the task form fields (src/components/form/*).

import { form, gendered, type Addressee } from '../gender';
import { prefixed } from '../prefix';

/** An actor phrase in the actor's own gender: act(dani, 'לקחה', 'לקח', 'לקח/ה') → "דני לקח". */
type Actor = { displayName: string } & Exclude<Addressee, string>;
const act = (who: Actor, f: string, m: string, n: string): string =>
  `${who.displayName} ${form(who, f, m, n)}`;

export const taskDetail = {
  title: 'פרטי משימה',
  back: 'חזרה',
  notFoundTitle: 'המשימה לא נמצאה',
  notFoundBody: 'אולי היא נמחקה, או שהקישור לא נכון.',
  backHome: 'לדף הבית',
  editTitle: 'כותרת המשימה',
  pending: 'ממתין לסנכרון',

  // owner block
  owner: 'אחריות',
  waiting: 'מחכה שמישהו ייקח',
  ownedByMe: 'אצלך',
  ownedBy: (name: string) => `אצל ${name}`,
  take: gendered('אני לוקחת', 'אני לוקח', 'אני לוקח/ת'),
  request: 'לבקש מ…',
  release: 'להחזיר לרשימה',
  takenBy: (a: Actor) => `${act(a, 'כבר לקחה', 'כבר לקח', 'כבר לקח/ה')} את המשימה`,
  /** Under "מיכל ביקשה ממך": the request is mine to answer. */
  awaitingMe: 'מחכה לתשובה שלך',
  /** The asker withdraws a request that still waits. */
  cancelRequest: 'ביטול הבקשה',
  cancelled: 'הבקשה בוטלה',

  // fields
  details: 'פרטים',
  when: 'מתי',
  due: 'עד מתי',
  priority: 'עדיפות',
  category: 'קטגוריה',
  recurrence: 'חוזרת',
  notes: 'הערות',
  notesPlaceholder: 'פרטים, טלפונים, מידות, כל מה שיעזור',
  none: 'אין',
  hardDeadline: 'מועד אחרון קשיח',
  hardDeadlineHint: 'נקבל תזכורת יום לפני',
  createdLine: (who: string, date: string) => `נוספה ע״י ${who} · ${date}`,

  // actions
  complete: 'בוצע',
  snooze: 'דחייה',
  share: 'שיתוף בוואטסאפ',
  delete: 'מחיקה',
  deleted: 'המשימה נמחקה',
  reopen: 'פתיחה מחדש',
  reopened: 'המשימה נפתחה מחדש',
  copied: 'הקישור הועתק',
  shareText: (title: string, when: string | null) => (when ? `${title} (${when})` : title),

  // done
  doneTitle: 'בוצעה',
  doneLine: (who: string, date: string) => `${who} · ${date}`,
  documentation: 'תיעוד',
  noDocumentation: 'בלי תיעוד',
  cost: 'עלות',
  place: 'איפה',
  contact: 'אצל מי',
  note: 'הערה',
  photo: (n: number) => `תמונה ${n}`,
  nextInstance: 'למשימה הבאה בסדרה',

  // history (actor phrases agree with the actor)
  history: 'היסטוריה',
  ev: {
    created: (a: Actor) => act(a, 'הוסיפה', 'הוסיף', 'הוסיף/ה'),
    taken: (a: Actor) => act(a, 'לקחה', 'לקח', 'לקח/ה'),
    requested: (a: Actor, to: string) =>
      `${act(a, 'ביקשה', 'ביקש', 'ביקש/ה')} ${prefixed('מ', to)}`,
    /** "דני לקח, לבקשת מיכל" */
    accepted: (a: Actor, by: string) => `${act(a, 'לקחה', 'לקח', 'לקח/ה')}, לבקשת ${by}`,
    /** "דני אמר שלא מתאים לו" (gentle; the actor's form). */
    declined: (a: Actor) => act(a, 'אמרה שלא מתאים לה', 'אמר שלא מתאים לו', 'אמר/ה שלא מתאים לו/ה'),
    /** The asker withdrew it: "מיכל ביטלה את הבקשה מדני". */
    withdrew: (a: Actor, to: string) =>
      `${act(a, 'ביטלה', 'ביטל', 'ביטל/ה')} את הבקשה ${prefixed('מ', to)}`,
    released: (a: Actor) => act(a, 'החזירה לרשימה', 'החזיר לרשימה', 'החזיר/ה לרשימה'),
    completed: (a: Actor) => act(a, 'סיימה', 'סיים', 'סיים/ה'),
    reopened: (a: Actor) => act(a, 'פתחה מחדש', 'פתח מחדש', 'פתח/ה מחדש'),
    snoozed: (a: Actor) => act(a, 'דחתה', 'דחה', 'דחה/תה'),
    edited: (a: Actor) => act(a, 'עדכנה', 'עדכן', 'עדכן/ה'),
    deleted: (a: Actor) => act(a, 'מחקה', 'מחק', 'מחק/ה')
  },
  someone: 'מישהו',
  today: 'היום',
  yesterday: 'אתמול',

  // form pickers (src/components/form/*)
  pick: {
    me: 'אני',
    nobody: 'ללא',
    today: 'היום',
    tomorrow: 'מחר',
    thisWeek: 'השבוע',
    date: 'תאריך',
    pickDate: 'בחירת תאריך',
    noRepeat: 'לא חוזרת',
    // RecurrencePicker: presets read as recurrenceText ("כל יום" …); then "אחר" for every N
    customRepeat: 'אחר',
    every: 'כל',
    everyHowMany: 'כל כמה',
    repeatUnit: 'ימים, שבועות, חודשים או שנים',
    unitOne: { daily: 'יום', weekly: 'שבוע', monthly: 'חודש', yearly: 'שנה' },
    unitMany: { daily: 'ימים', weekly: 'שבועות', monthly: 'חודשים', yearly: 'שנים' },
    onDays: 'באילו ימים?',
    dayLetters: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'],
    clearDate: 'ניקוי התאריך',
    photoAdd: 'הוספת תמונה',
    photoRemove: (n: number) => `הסרת תמונה ${n}`,
    photoBusy: 'מכין את התמונה…',
    photoError: 'לא הצלחנו לקרוא את התמונה',
    photoLimit: (max: number) => `עד ${max} תמונות`
  }
} as const;
