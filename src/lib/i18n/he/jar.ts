// owner: step 4.2 — only that step edits this file
// Jar screen (#/jar), JarMini, CelebrationOverlay and the JarSetup sheet (`setup`).
// Goal modes (domain/jar.ts): 'each' = "כל אחד תורם", 'together' = "ביחד". Team words only: no
// ranking, no "who did more"; a member's row shows their own part, never a comparison.

/** "משימה אחת" / "5 משימות" (a no-break space: the number never wraps away from its word). */
const tasks = (n: number) => (n === 1 ? 'משימה\u00a0אחת' : `${n}\u00a0משימות`);
/** "ו" + a phrase: "ומשימה אחת", "ו־2 משימות" (a maqaf before a digit). */
const and = (phrase: string) => (/^\d/.test(phrase) ? `ו־${phrase}` : `ו${phrase}`);

/** Someone whose part is not done yet: `name` null = me ("שלך"). */
export interface JarLeft {
  name: string | null;
  left: number;
}

const whose = (p: JarLeft) => `${tasks(p.left)} ${p.name === null ? 'שלך' : `של ${p.name}`}`;

export const jar = {
  title: 'הצנצנת',
  setup: {
    title: 'הצ׳ופר הבא',
    editTitle: 'עריכת הצנצנת',
    nextHint: 'צנצנת חדשה מתחילה. רוצים לשנות משהו?',
    treat: 'מה הצ׳ופר?',
    treatPlaceholder: 'למשל: ארוחה במסעדה',
    treatError: 'כדאי לכתוב מה הצ׳ופר',
    suggestionsLabel: 'רעיונות לצ׳ופר',
    suggestions: [
      'ארוחה במסעדה',
      'ערב סרט',
      'גלידה',
      'בוקר בלי משימות',
      'טיול משפחתי',
      'ערב משחקים'
    ],
    mode: 'איך ממלאים את הצנצנת?',
    target: 'כמה משימות ממלאות את הצנצנת?',
    share: 'כמה משימות כל אחד סוגר?',
    targetSuffix: 'משימות',
    /** Under the share stepper: what it adds up to for this household. */
    shareTotal: (total: number, members: number) =>
      members <= 1 ? 'כשיצטרפו עוד בני בית, לכל אחד יהיה חלק משלו' : `ביחד: ${tasks(total)} בצנצנת`,
    hint: 'צ׳ופר משותף, וכל משימה שנסגרת מקרבת אותו.',
    /** Switching to "כל אחד תורם" mid-round. */
    switchHint: 'מה שכבר בצנצנת נשאר, וכל אחד ממשיך מהחלק שכבר עשה.',
    save: 'שמירה',
    start: 'להתחיל צנצנת'
  },
  modes: {
    each: {
      title: 'כל אחד תורם',
      body: 'הצ׳ופר נפתח כשכל אחד סוגר את החלק שלו'
    },
    together: {
      title: 'ביחד',
      body: 'כל משימה, של כל אחד, ממלאת את אותה צנצנת'
    }
  },
  /** The goal line under the treat. */
  goal: {
    each: (share: number) => `כל אחד מאיתנו סוגר ${tasks(share)}`,
    together: (target: number) => `ביחד · ${tasks(target)}`
  },
  /** The warm line under the goal while the jar fills. */
  status: {
    total: (n: number) => `עוד ${tasks(n)} ואנחנו בצ׳ופר`,
    /** 'each', one or two parts left (me first): "עוד משימה אחת שלך ו־2 משימות של דני…". */
    parts: (left: readonly JarLeft[]) => {
      const [a, b] = left;
      if (!a) return '';
      return b
        ? `עוד ${whose(a)} ${and(whose(b))}, ואנחנו בצ׳ופר`
        : `עוד ${whose(a)} ואנחנו בצ׳ופר`;
    }
  },
  /** "7 מתוך 10". */
  progress: (count: number, target: number) => `${count} מתוך ${target}`,
  aria: (count: number, target: number) => `צנצנת עם ${count} גולות מתוך ${target}`,
  /** A member's part ('each'). */
  part: {
    label: 'החלקים שלנו',
    of: (done: number, share: number) => `${done} מתוך ${share}`,
    done: 'הושלם',
    aria: (name: string, done: number, share: number) => `${name}: ${done} מתוך ${share}`,
    doneAria: (name: string) => `החלק של ${name} הושלם`
  },
  /** Completions past everyone's parts (shared, never per person). */
  bonus: (n: number) => (n === 1 ? 'ועוד משימה אחת בונוס' : `ועוד ${n} משימות בונוס`),
  /** 'together': who has added marbles this round. */
  contributors: 'תרמו לצנצנת',
  edit: 'עריכת הצנצנת',
  full: 'עשינו את זה ביחד',
  redeem: 'מימשנו! צנצנת חדשה',
  history: 'צ׳ופרים שהרווחנו',
  filledOn: (date: string) => `התמלאה ב-${date}`,
  redeemedOn: (date: string) => `מומש ב-${date}`,
  waiting: 'מחכה למימוש',
  round: (n: number) => `צנצנת ${n}`,
  tookPart: (names: string) => `השתתפו: ${names}`,
  empty: {
    title: 'עוד אין צנצנת',
    body: 'בוחרים צ׳ופר משותף, וכל משימה שנסגרת מקרבת אותו.',
    cta: 'להגדיר צנצנת'
  },
  mini: {
    label: 'הצנצנת',
    full: 'הצנצנת מלאה',
    fullCta: 'לחגוג',
    open: 'פתיחת הצנצנת',
    /** The per-member bar ('each'). */
    parts: (parts: string) => `החלקים: ${parts}`
  },
  party: {
    title: 'עשינו את זה ביחד',
    body: 'הצנצנת מלאה. מגיע לנו:',
    bodyEach: 'כל אחד עשה את החלק שלו. מגיע לנו:',
    close: 'איזה כיף'
  },
  /** Deleting the jar: the edit sheet's quiet action, its confirmation and the snackbar. */
  remove: {
    action: 'מחיקת הצנצנת',
    title: 'למחוק את הצנצנת?',
    /** Exactly what happens. `full`: its treat was not redeemed yet; `history`: treats earned. */
    body: (o: { full: boolean; history: boolean }) =>
      [
        o.full
          ? 'הצנצנת וכל מה שנאסף בה יימחקו, גם הצ׳ופר שעוד לא מימשנו.'
          : 'הצנצנת וכל מה שנאסף בה עד עכשיו יימחקו.',
        o.history
          ? 'מה שכבר הרווחנו נשאר ב״צ׳ופרים שהרווחנו״, ואפשר להתחיל צנצנת חדשה מתי שרוצים.'
          : 'אפשר להתחיל צנצנת חדשה מתי שרוצים.'
      ].join(' '),
    confirm: 'מחיקה',
    done: 'הצנצנת נמחקה'
  },
  /** Deleting an earned treat from the history. */
  removeTreat: {
    /** The quiet "⋯" on a history row. */
    menu: (treat: string) => `אפשרויות ל״${treat}״`,
    action: 'מחיקה מההיסטוריה',
    title: (treat: string) => `למחוק את ״${treat}״ מההיסטוריה?`,
    body: 'הצנצנת הנוכחית לא משתנה.',
    confirm: 'מחיקה',
    done: 'הצ׳ופר נמחק מההיסטוריה'
  },
  /** The "בוצע" snackbar after a completion, when it is a jar moment. */
  snack: {
    shareDone: 'בוצע · סגרת את החלק שלך בצנצנת',
    filled: 'בוצע · הצנצנת מלאה'
  }
} as const;
