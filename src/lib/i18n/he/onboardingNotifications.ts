// owner: step 5.1 — only that step edits this file
// The onboarding notifications step (#/onboarding/notifications).

export const onboardingNotifications = {
  title: 'שנעדכן אתכם?',
  lead: 'התראה קטנה בטלפון, רק כשבאמת יש בשביל מה. בלי הצפות, ובלילה בשקט.',
  items: [
    { key: 'requests', text: 'כשמישהו מבקש ממך משימה' },
    { key: 'reminders', text: 'תזכורת בבוקר של היום שבו משהו צריך לקרות' },
    { key: 'partnerDone', text: 'כשבן או בת הזוג סיימו משהו' },
    { key: 'weekly', text: 'פעם בשבוע, מה מחכה כבר זמן מה' }
  ],
  enable: 'הפעלה',
  later: 'אחר כך',
  laterHint: 'אפשר להפעיל בכל רגע מההגדרות'
} as const;
