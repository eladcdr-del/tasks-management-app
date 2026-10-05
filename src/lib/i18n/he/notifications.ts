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
    denied: 'הדפדפן חוסם התראות מהאפליקציה',
    unsupported: 'הדפדפן הזה לא תומך בהתראות. כדאי לפתוח את האפליקציה בכרום',
    notConfigured: 'ההתראות יעבדו אחרי שיחברו את האפליקציה ל-Firebase',
    demo: 'במצב הדגמה לא נשלחות התראות. ההגדרות כאן נשמרות כרגיל'
  },
  deniedHelpTitle: 'איך מאפשרים שוב?',
  deniedSteps: [
    'בכרום, לוחצים על ⋮ (שלוש הנקודות) למעלה',
    'נכנסים ל"הגדרות אתר" (או לחצו על סמל המנעול ליד הכתובת)',
    'בוחרים "התראות" ← "אפשר"',
    'חוזרים לכאן ומרעננים את הדף'
  ],
  typesTitle: 'על מה להודיע לי',
  types: {
    requests: { label: 'בקשות ממני', desc: 'כשמישהו מבקש ממך משימה' },
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
