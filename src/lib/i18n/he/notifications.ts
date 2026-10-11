// owner: step 5.1 — only that step edits this file
// Notification settings block, permission states, foreground messages, "בדיקת התראות" and the
// installed app's own permission (Home's banner).

import { gendered } from '../gender';

/** Allowing notifications again, as steps through the phone's settings (shown with ← between). */
const APP_PATH = ['לחיצה ארוכה על הסמל של HomeCare', '"פרטי האפליקציה"', '"התראות"', 'לאפשר'];
/** The site as Chrome lists it under Settings → Site settings → Notifications. */
const CHROME_PATH = ['⋮', '"הגדרות"', '"הגדרות אתר"', '"התראות"', 'eladcdr-del.github.io', 'לאפשר'];

export const notifications = {
  title: 'התראות',
  enable: 'הפעלת התראות',
  /** The button when permission is granted but this device is not registered yet. */
  reconnect: 'הפעלה מחדש',
  /** Status line per pushStatus() state. */
  status: {
    granted: 'ההתראות פעילות במכשיר הזה',
    default: 'ההתראות עוד לא הופעלו במכשיר הזה',
    unregistered: 'ההתראות עוד לא מגיעות למכשיר הזה',
    denied: 'ההתראות חסומות במכשיר הזה',
    unsupported: 'הדפדפן הזה לא תומך בהתראות. כדאי לפתוח את האפליקציה בכרום',
    notConfigured: 'ההתראות יעבדו אחרי שיחברו את האפליקציה ל-Firebase',
    demo: 'במצב הדגמה לא נשלחות התראות. ההגדרות כאן נשמרות כרגיל'
  },
  deniedHelpTitle: 'איך מאפשרים שוב?',
  /** Blocked, in the installed app (Android): through the system's app info. */
  deniedStepsApp: [
    'לוחצים לחיצה ארוכה על הסמל של HomeCare במסך הבית',
    'בוחרים "פרטי האפליקציה" ← "התראות"',
    'מאפשרים התראות וחוזרים לכאן'
  ],
  /** Blocked, in a Chrome tab: through the site info next to the address. */
  deniedSteps: ['לוחצים על הסמל שליד הכתובת, למעלה', 'בוחרים "הרשאות" ומאפשרים "התראות"'],
  typesTitle: 'על מה להודיע לי',
  types: {
    requests: { label: 'בקשות', desc: 'כשמבקשים ממך משימה, וכשעונים לבקשה שלך' },
    reminders: { label: 'תזכורות', desc: 'בבוקר של יום היעד, וערב לפני מועד אחרון' },
    partnerDone: { label: 'משימות שהושלמו', desc: 'כשמישהו אחר בבית מסיים משימה' },
    weekly: { label: 'סיכום שבועי', desc: 'ביום ראשון, משימות שמחכות כבר זמן מה' }
  },
  enabled: 'ההתראות הופעלו',
  failed: 'לא הצלחנו להפעיל התראות. נסו שוב בעוד רגע',
  quietHours: 'בין 22:00 ל-07:30 לא נשלחות התראות',
  /** Foreground snackbar action. */
  open: 'פתיחה',

  /**
   * "בדיקת התראות" (Settings): a notification from this phone right away, and a real push from the
   * notifier on its next run (within about 5 minutes). The panel tells the two apart.
   */
  test: {
    action: 'בדיקת התראות',
    /** The local notification. */
    localTitle: 'בדיקה: כך נראית התראה מ-HomeCare',
    localBody: 'אם רואים אותה, הטלפון מציג התראות של האפליקציה',
    /** The panel's first line, by what worked. */
    sent: 'שלחנו התראה לטלפון הזה עכשיו, ותוך כמה דקות תגיע עוד אחת מהשרת.',
    sentLocalOnly:
      'שלחנו התראה לטלפון הזה עכשיו. את ההתראה מהשרת לא הצלחנו לבקש כרגע, כדאי לנסות שוב כשיש אינטרנט.',
    sentServerOnly:
      'לא הצלחנו להציג התראה בטלפון הזה עכשיו, אבל תוך כמה דקות אמורה להגיע אחת מהשרת.',
    failed: 'לא הצלחנו לשלוח התראת בדיקה. כדאי לנסות שוב בעוד רגע.',
    /** The first one did not appear: notifications are blocked on the phone. */
    noFirst: 'הראשונה לא הופיעה? כנראה שההתראות חסומות בטלפון. כך מאפשרים אותן:',
    /** The local one could not be shown at all. */
    blocked: 'כנראה שההתראות חסומות בטלפון. כך מאפשרים אותן:',
    /** In the installed app (Android's app info), and in Chrome (the site's permission). */
    paths: [
      { label: 'באפליקציה', steps: APP_PATH },
      { label: 'בכרום', steps: CHROME_PATH }
    ],
    /** The first appeared, the second did not: tell us (the notifier side needs a look). */
    noSecond: gendered(
      'הראשונה הופיעה והשנייה לא הגיעה תוך 10\u00a0דקות? ספרי לנו ונבדוק.',
      'הראשונה הופיעה והשנייה לא הגיעה תוך 10\u00a0דקות? ספר לנו ונבדוק.',
      'הראשונה הופיעה והשנייה לא הגיעה תוך 10\u00a0דקות? ספרו לנו ונבדוק.'
    )
  },

  /**
   * The installed app (Android) has no notification permission of its own although they were
   * allowed in the browser, or this is its first launch: Home's banner, and Settings.
   */
  app: {
    body: 'כדי שההתראות יגיעו גם לאפליקציה המותקנת, צריך לאשר אותן כאן פעם אחת',
    action: 'אישור התראות',
    /** Refused in the installed app: Android's app info is the way back. */
    blocked: 'ההתראות חסומות באפליקציה המותקנת. כך מאפשרים אותן:',
    blockedSteps: APP_PATH,
    dismiss: 'לא עכשיו'
  }
} as const;
