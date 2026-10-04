// owner: step 4.2 — only that step edits this file
// Jar screen (#/jar), JarMini, CelebrationOverlay and the JarSetup sheet (`setup`).

export const jar = {
  title: 'הצנצנת',
  celebration: 'הצנצנת התמלאה',
  setup: {
    title: 'הצ׳ופר הבא',
    editTitle: 'עריכת הצנצנת',
    treat: 'מה הצ׳ופר?',
    treatPlaceholder: 'למשל: ארוחה במסעדה',
    treatError: 'כדאי לכתוב מה הצ׳ופר',
    target: 'כמה משימות ממלאות את הצנצנת?',
    targetSuffix: 'משימות',
    hint: 'כל משימה שנסגרת, של כל אחד מכם, מוסיפה גולה לצנצנת.',
    save: 'שמירה',
    start: 'להתחיל צנצנת'
  },
  /** "7 מתוך 10". */
  progress: (count: number, target: number) => `${count} מתוך ${target}`,
  /** "עוד 3 משימות" / "עוד משימה אחת". */
  remaining: (n: number) => (n === 1 ? 'עוד משימה אחת' : `עוד ${n} משימות`),
  aria: (count: number, target: number) => `צנצנת עם ${count} גולות מתוך ${target}`,
  explainer: 'כל משימה שנסגרת ממלאת את הצנצנת. ביחד, בלי ניקוד אישי.',
  edit: 'עריכת הצנצנת',
  full: 'הצנצנת מלאה',
  fullBody: 'עשיתם את זה ביחד. הגיע הזמן לצ׳ופר:',
  redeem: 'מימשנו! צנצנת חדשה',
  redeemed: 'צנצנת חדשה התחילה',
  history: 'צ׳ופרים שהרווחנו',
  filledOn: (date: string) => `התמלאה ב-${date}`,
  redeemedOn: (date: string) => `מומש ב-${date}`,
  waiting: 'מחכה למימוש',
  round: (n: number) => `צנצנת ${n}`,
  empty: {
    title: 'עוד אין צנצנת',
    body: 'בוחרים צ׳ופר משותף ויעד, וכל משימה שנסגרת ממלאת אותה.',
    cta: 'להגדיר צנצנת'
  },
  mini: {
    label: 'הצנצנת',
    full: 'הצנצנת מלאה',
    fullCta: 'לחגוג',
    open: 'פתיחת הצנצנת'
  },
  party: {
    title: 'הצנצנת התמלאה',
    body: 'עשיתם את זה ביחד. מגיע לכם:',
    close: 'איזה כיף'
  }
} as const;
