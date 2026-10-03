// owner: step 3.1 — only that step edits this file
// Welcome / sign-in, profile, household, install and join screens, including their error copy
// (sign-in failures, join: expired / revoked / full / not-found). The notifications step is 5.1's
// (onboardingNotifications.ts).

export const onboarding = {
  welcome: { title: 'ברוכים הבאים ל-HomeCare' },
  profile: { title: 'נעים להכיר' },
  household: { title: 'הבית שלנו' },
  install: { title: 'התקנה למסך הבית' },
  join: { title: 'הצטרפות לבית' }
} as const;
