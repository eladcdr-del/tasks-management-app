// owner: step 3.2 — only that step edits this file
// Home screen: greeting, pulse card, sections, the control bar (tabs + chips), the list and its
// category groups, empty states, and choosing several tasks at once (delete / take them).

import { gendered, type Addressee } from '../gender';

const takeOf = gendered('אני לוקחת', 'אני לוקח', 'אני לוקח/ת');

export const home = {
  title: 'בית',
  /** "בוקר טוב, מיכל" — the greeting comes from i18n/format greeting(hour). */
  hello: (greeting: string) => `${greeting}, `,
  people: 'בני הבית',
  pulse: {
    label: 'תמונת מצב',
    attention: 'באיחור או דחוף',
    today: 'להיום',
    waiting: 'מחכות שמישהו ייקח',
    /** The row under the numerals while someone asked me for something. */
    requested: 'ביקשו ממך',
    /** Screen-reader name of a numeral button: "3 באיחור או דחוף, מעבר לרשימה". */
    go: (n: number, what: string) => `${n} ${what}, מעבר לרשימה`
  },
  balance: {
    label: 'משימות פתוחות אצל כל אחד',
    unowned: (n: number) => (n === 1 ? 'ועוד אחת של אף אחד' : `ועוד ${n} של אף אחד`)
  },
  sections: {
    attention: 'דורש תשומת לב',
    requested: 'ביקשו ממך',
    waiting: 'מחכות שמישהו ייקח',
    /** The list under the control bar (a heading for screen readers). */
    list: 'כל המשימות'
  },
  buckets: {
    label: 'מתי',
    today: 'היום',
    week: 'השבוע',
    /** On Friday and Saturday the week tab already covers the coming week. */
    weekAhead: 'השבוע הקרוב',
    later: 'בהמשך',
    all: 'הכל'
  },
  filters: {
    label: 'של מי',
    all: 'הכל',
    mine: 'שלי',
    /** Nobody took them yet (a request waiting for someone else's answer included). */
    free: 'פנויות',
    of: (name: string) => `של ${name}`,
    ofPrefix: 'של'
  },
  groups: {
    /** "אחר" and tasks without a category, together. */
    misc: 'שונות',
    /** The toggle under a collapsed group: "עוד 6". */
    more: (n: number) => `עוד ${n}`,
    less: 'פחות',
    /** Screen-reader names of the toggle: "עוד 6 ב"בית ותיקונים"". */
    moreLabel: (n: number, group: string) =>
      n === 1 ? `עוד משימה אחת ב"${group}"` : `עוד ${n} משימות ב"${group}"`,
    lessLabel: (group: string) => `פחות משימות ב"${group}"`
  },
  empty: {
    today: {
      title: 'הכל סגור להיום. אפשר לנשום.',
      /** Today's list is empty, but something waits above it (attention, or a request to me). */
      rest: 'אין עוד משהו מתוכנן להיום',
      /** Names the first tab that has tasks: "המשימות הבאות מחכות בלשונית "בהמשך"." */
      body: (tab: string) => `המשימות הבאות מחכות בלשונית "${tab}".`
    },
    week: {
      title: 'השבוע נראה פנוי',
      body: 'אפשר לתכנן משהו, או פשוט ליהנות מהשקט.'
    },
    later: {
      title: 'אין כלום שמחכה להמשך',
      body: 'נזכרת במשהו שצריך לעשות מתישהו? כדאי לרשום אותו עכשיו.'
    },
    filtered: {
      title: 'אין כאן משימות בסינון הזה',
      body: 'אפשר לבחור "הכל" כדי לראות את כל המשימות.'
    },
    /** Chip "פנויות" with nothing in it. */
    free: {
      title: 'אין כאן משימות פנויות',
      /** Nothing waits on any tab. */
      none: 'כל המשימות כבר אצל מישהו'
    },
    /** Tab "הכל" (chip "הכל") is empty: every open task is in the blocks above. */
    allTab: {
      title: 'כל המשימות הפתוחות מופיעות למעלה'
    },
    all: {
      title: 'הבית מסודר',
      body: 'אין משימות פתוחות. כשמשהו עולה, מוסיפים אותו בכמה שניות.'
    }
  },
  /** Choosing several tasks at once (a "בחירה" button in the bar, or a long press on a row). */
  select: {
    /** The quiet button in the bar that starts choosing. */
    start: 'בחירה',
    /** The bar while nothing is chosen yet. */
    none: 'בחירת משימות',
    /** "נבחרו 3". */
    count: (n: number) => (n === 1 ? 'נבחרה משימה אחת' : `נבחרו ${n}`),
    all: 'בחירת הכל',
    /** Everything in the list is chosen: the same button lets it all go. */
    clear: 'ניקוי הבחירה',
    /** Leaves the mode. */
    cancel: 'ביטול',
    /** The bar at the bottom. */
    actions: 'מה לעשות עם המשימות שנבחרו',
    /** "מחיקה (3)" ("מחיקה" while nothing is chosen). */
    delete: (n: number) => (n === 0 ? 'מחיקה' : `מחיקה (${n})`),
    /** "אני לוקחת (3)": the free ones among those chosen ("אני לוקחת" when there are none). */
    take: (me: Addressee, n: number) => (n === 0 ? takeOf(me) : `${takeOf(me)} (${n})`),
    /** One snackbar for the lot, with "ביטול". */
    deleted: (n: number) => (n === 1 ? 'המשימה נמחקה' : `נמחקו ${n} משימות`),
    taken: (n: number) => (n === 1 ? 'המשימה אצלך' : `${n} משימות אצלך`),
    /** Someone was faster on some of them: "2 משימות אצלך. אחת כבר נלקחה". */
    takenSome: (n: number, lost: number) => {
      if (n === 0) return lost === 1 ? 'המשימה כבר נלקחה' : 'המשימות כבר נלקחו';
      const mine = n === 1 ? 'משימה אחת אצלך' : `${n} משימות אצלך`;
      return `${mine}. ${lost === 1 ? 'אחת כבר נלקחה' : `${lost} כבר נלקחו`}`;
    }
  },
  newTask: 'משימה חדשה',
  loading: 'טוען את המשימות…'
} as const;
