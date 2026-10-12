// owner: step 5.1 — only that step edits this file
// The onboarding notifications step (#/onboarding/notifications).

export const onboardingNotifications = {
  title: 'שנעדכן אתכם?',
  lead: 'התראה קטנה בטלפון, רק כשבאמת יש בשביל מה. בלי הצפות, ובלילה בשקט.',
  items: [
    { key: 'requests', text: 'כשמבקשים ממך משימה, וכשעונים לבקשה שלך' },
    { key: 'newTasks', text: 'כשמישהו אחר מוסיף משימות לבית' },
    { key: 'reminders', text: 'בבוקר, מה צריך לקרות היום ומה כבר באיחור' },
    { key: 'soon', text: 'חצי שעה לפני משימה שנקבעה לה שעה' },
    { key: 'partnerDone', text: 'כשמישהו אחר בבית מסיים משימה' },
    { key: 'weekly', text: 'פעם בשבוע, מה מחכה כבר זמן מה' }
  ],
  enable: 'הפעלה',
  later: 'אחר כך',
  continue: 'המשך',
  laterHint: 'אפשר להפעיל בכל רגע מההגדרות',
  /** "הפעלה" was allowed but this device could not be registered; the button becomes a retry. */
  failed: 'לא הצלחנו להפעיל את ההתראות. כדאי לבדוק שיש אינטרנט ולנסות שוב.'
} as const;
