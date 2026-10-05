// owner: step 3.1 — only that step edits this file
// Header, bottom nav, FAB, sheet & snackbar hosts, the boot splash.

export const shell = {
  tabs: {
    home: 'בית',
    memory: 'זיכרון הבית',
    jar: 'הצנצנת',
    household: 'הבית שלנו'
  },
  navLabel: 'ניווט ראשי',
  fab: 'משימה חדשה',
  /** Accessible name of the snackbar live region. */
  snackbarRegion: 'הודעות',
  /** Under the splash when the start takes unusually long (a slow or stalled connection). */
  slowStart: 'זה לוקח קצת יותר זמן מהרגיל. אולי החיבור לאינטרנט איטי.'
} as const;
