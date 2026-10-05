// owner: step 5.1 — only that step edits this file
// Notification settings block, permission states, foreground messages.

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
  open: 'פתיחה'
} as const;
