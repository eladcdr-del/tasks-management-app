// owner: step 2.2 — only that step edits this file
// RepoError code → Hebrew message (src/lib/data/firebase/errors.ts maps codes to these keys).
// Sign-in and join error copy is 3.1's (onboarding.ts).
//
// Use `repoErrorMessage(err)` from $lib/data/firebase/errors (SDK-free) rather than reading these
// keys directly: it also picks `cancelled`, `invalid` and the unauthorized-domain hint.

/** The production host (GitHub Pages); the hint names it when the page cannot tell. */
const DEFAULT_HOST = 'eladcdr-del.github.io';

export const errors = {
  generic: 'משהו השתבש. נסו שוב.',
  byCode: {
    'not-found': 'לא מצאנו את זה. אולי מישהו כבר מחק את זה.',
    expired: 'תוקף ההזמנה פג. בקשו קישור חדש ממי ששלח לכם אותו.',
    revoked: 'ההזמנה הזאת כבר לא פעילה. בקשו קישור חדש ממי ששלח לכם אותו.',
    full: 'הבית הזה כבר מלא. אפשר עד שישה בני בית.',
    'already-member': 'אתם כבר בבית הזה, אין צורך להצטרף שוב.',
    permission: 'אין הרשאה לפעולה הזאת.',
    'popup-blocked': 'הדפדפן חסם את חלון ההתחברות. אפשרו חלונות קופצים ונסו שוב.',
    network: 'אין חיבור לאינטרנט כרגע. נסו שוב כשהחיבור יחזור.',
    conflict: 'מישהו אחר עדכן את זה ממש עכשיו. הרשימה כבר מתעדכנת.',
    unknown: 'משהו השתבש. נסו שוב.'
  },
  /** The user closed the Google window. Usually shown quietly, if at all. */
  cancelled: 'ההתחברות בוטלה. אפשר לנסות שוב מתי שנוח.',
  /** Client-side validation failed before anything was saved. */
  invalid: 'חלק מהפרטים לא תקינים. בדקו ונסו שוב.',
  /** Firebase Auth does not list this site under Authorized domains (a one-time setup step). */
  unauthorizedDomain: (host: string = DEFAULT_HOST) =>
    `עוד רגע וזה עובד: צריך לאשר את הכתובת ${host} בהגדרות Firebase. אלעד, זה ב-Firebase Console ← Authentication ← Settings ← Authorized domains ← Add domain.`
} as const;
