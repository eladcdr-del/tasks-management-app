// owner: step 3.2 — only that step edits this file
// Home screen: greeting, pulse card, sections, buckets, filters, empty states.

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
    /** Screen-reader name of a numeral button: "3 באיחור או דחוף, מעבר לרשימה". */
    go: (n: number, what: string) => `${n} ${what}, מעבר לרשימה`
  },
  balance: {
    label: 'משימות פתוחות אצל כל אחד',
    unowned: (n: number) => (n === 1 ? 'ועוד אחת של אף אחד' : `ועוד ${n} של אף אחד`)
  },
  sections: {
    attention: 'דורש תשומת לב',
    waiting: 'מחכות שמישהו ייקח'
  },
  buckets: {
    label: 'מתי',
    today: 'היום',
    week: 'השבוע',
    /** On Friday and Saturday the week tab already covers the coming week. */
    weekAhead: 'השבוע הקרוב',
    later: 'בהמשך'
  },
  filters: {
    label: 'של מי',
    all: 'הכל',
    mine: 'שלי',
    of: (name: string) => `של ${name}`,
    ofPrefix: 'של'
  },
  empty: {
    today: {
      title: 'הכל סגור להיום. אפשר לנשום.',
      body: 'מה שמתוכנן בהמשך מחכה בלשונית השבוע.'
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
    all: {
      title: 'הבית מסודר',
      body: 'אין משימות פתוחות. כשמשהו עולה, מוסיפים אותו בכמה שניות.'
    }
  },
  newTask: 'משימה חדשה',
  loading: 'טוען את המשימות…'
} as const;
