// owner: step 3.1 — only that step edits this file
// (Built in 3.1; formerly reserved for 4.3.)
// Settings screen (#/settings). The notifications section's copy is 5.1's (notifications.ts).

export const settings = {
  title: 'הגדרות',
  appearance: 'מראה',
  theme: { system: 'מערכת', light: 'בהיר', dark: 'כהה' },
  themeLabel: 'ערכת צבעים',
  haptics: 'רטט עדין',
  hapticsHint: 'רטט קצר כשמסמנים משימה או לוקחים אותה',
  install: {
    title: 'התקנה למסך הבית',
    hint: 'בכרום: תפריט ⋮ ← ״הוספה למסך הבית״',
    installed: 'האפליקציה מותקנת במכשיר הזה',
    action: 'התקנה'
  },
  demo: {
    title: 'מצב תצוגה',
    actAs: 'להציג כ…',
    hint: 'אפשר לעבור בין בני הבית ולראות את הרשימה בעיניים שלהם.',
    exit: 'יציאה מהדמו'
  },
  account: 'חשבון',
  signOut: 'התנתקות',
  about: 'על האפליקציה',
  version: (v: string, commit: string) => `גרסה ${v} · ${commit}`
} as const;
