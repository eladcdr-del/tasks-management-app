// owner: step 2.2 — only that step edits this file
// RepoError code → Hebrew message. A flat table of strings: the UI reads
// `he.errors[code] ?? he.errors.generic` (src/lib/state/ui.svelte.ts). Sign-in and join screen copy
// is 3.1's (onboarding.ts).
//
// `repoErrorMessage(err)` from $lib/data/firebase/errors (SDK-free) also picks `cancelled`, `invalid`
// and the unauthorized-domain hint, which the bare code cannot tell apart.

/** The production host (GitHub Pages), named in the unauthorized-domain hint. */
export const PAGES_HOST = 'eladcdr-del.github.io';

const GENERIC = 'משהו השתבש. נסו שוב בעוד רגע.';

export const errors = {
  generic: GENERIC,

  // One per RepoError code.
  'not-found': 'לא מצאנו את זה. אולי מישהו כבר מחק.',
  expired: 'תוקף ההזמנה פג. בקשו קישור חדש.',
  revoked: 'ההזמנה הזאת כבר לא פעילה. בקשו קישור חדש.',
  full: 'הבית הזה כבר מלא. אפשר עד שישה בני בית.',
  'already-member': 'אתם כבר בבית הזה. אין צורך להצטרף שוב.',
  permission: 'אין הרשאה לעשות את זה.',
  /** Also a redirect sign-in that came back without the user (ERROR_DETAIL.redirectLost). */
  'popup-blocked': 'ההתחברות עם Google לא הושלמה. נסו שוב, ואם זה חוזר, פתחו את האפליקציה בכרום.',
  network: 'אין חיבור כרגע. נסו שוב כשהאינטרנט יחזור.',
  conflict: 'מישהו עדכן את זה ממש עכשיו. הרשימה כבר מתעדכנת.',
  unknown: GENERIC,

  /** The user closed the Google window. Usually shown quietly, if at all. */
  cancelled: 'ההתחברות בוטלה. אפשר לנסות שוב מתי שנוח.',
  /** Client-side validation failed before anything was saved. */
  invalid: 'חלק מהפרטים לא תקינים. בדקו ונסו שוב.',
  /** Firebase Auth does not list the site under Authorized domains (a one-time setup step). */
  unauthorizedDomain: `עוד רגע וזה עובד: צריך לאשר את הכתובת ${PAGES_HOST} ב-Firebase. אלעד, זה ב-Firebase Console ← Authentication ← Settings ← Authorized domains ← Add domain.`
} as const;
