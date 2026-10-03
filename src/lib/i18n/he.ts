// CONTRACT — all UI strings (Hebrew). Created in step 1.1.
//
// Ownership: each step appends keys ONLY inside its own namespace block below (marked with the
// owning step). Renaming or removing another block's keys goes through the orchestrator.
// Tone (Blueprint §8): warm, plain, no exclamation spam, no slang, emoji-free.
// User-entered text is rendered with dir="auto"; numbers via Intl (src/lib/i18n/format.ts, 1.2).

import type { AddressAs } from '../domain/types';

// ── Gendered strings ──────────────────────────────────────────────────────────
// Hebrew verbs/adjectives agree with the person: f = נקבה, m = זכר, n = neutral (לוקח/ת).
// "Me" strings use the viewer's addressAs ("אני לוקחת"); actor phrases use the ACTOR's
// addressAs ("דני לקח", "מיכל ביקשה").

/** Anything with an `addressAs` (a Member, a NewMemberProfile…), or the AddressAs itself. */
export type Addressee = AddressAs | { readonly addressAs: AddressAs };

const asOf = (who: Addressee): AddressAs => (typeof who === 'string' ? who : who.addressAs);

/** Picks the matching form: `form(member, 'סיימה', 'סיים', 'סיים/ה')`. */
export function form(who: Addressee, f: string, m: string, n: string): string {
  switch (asOf(who)) {
    case 'f':
      return f;
    case 'm':
      return m;
    default:
      return n;
  }
}

/** A string that varies by addressee. */
export type Gendered = (who: Addressee) => string;

/** Builds a Gendered string: `take: gendered('אני לוקחת', 'אני לוקח', 'אני לוקח/ת')` → `he.x.take(me)`. */
export function gendered(f: string, m: string, n: string): Gendered {
  return (who) => form(who, f, m, n);
}

// ── Strings ───────────────────────────────────────────────────────────────────

export const he = {
  // ═══ common · owner 1.1 (shared words; additions via orchestrator) ═══════════
  common: {
    appName: 'HomeCare',
    ok: 'אישור',
    cancel: 'ביטול',
    save: 'שמירה',
    close: 'סגירה',
    back: 'חזרה',
    next: 'המשך',
    skip: 'דילוג',
    done: 'סיום',
    undo: 'ביטול',
    edit: 'עריכה',
    delete: 'מחיקה',
    retry: 'נסו שוב',
    loading: 'טוען…',
    comingSoon: 'המסך הזה ייבנה בקרוב',
    you: gendered('את', 'אתה', 'את/ה')
  },

  // ═══ shell · owner 3.1 (header, bottom nav, FAB, sheet & snackbar hosts) ═════
  shell: {
    tabs: {
      home: 'בית',
      memory: 'זיכרון הבית',
      jar: 'הצנצנת',
      household: 'הבית שלנו'
    },
    navLabel: 'ניווט ראשי',
    fab: 'משימה חדשה',
    update: {
      // owner 5.1 (UpdatePrompt)
      ready: 'גרסה חדשה מוכנה',
      action: 'עדכון'
    }
  },

  // ═══ onboarding · owner 3.1 (notifications step: 5.1) ═══════════════════════
  onboarding: {
    welcome: { title: 'ברוכים הבאים ל-HomeCare' },
    profile: { title: 'נעים להכיר' },
    household: { title: 'הבית שלנו' },
    install: { title: 'התקנה למסך הבית' },
    notifications: { title: 'התראות' }, // owner 5.1
    join: { title: 'הצטרפות לבית' }
  },

  // ═══ home · owner 3.2 ════════════════════════════════════════════════════════
  home: {
    title: 'בית'
  },

  // ═══ task · owner 3.2 (cards) / 3.3 (detail, form) ════════════════════════════
  task: {
    detailTitle: 'פרטי משימה',
    take: gendered('אני לוקחת', 'אני לוקח', 'אני לוקח/ת')
  },

  // ═══ sheets · owner 3.2 (request, snooze) / 3.3 (quickAdd, complete) / 4.2 (jarSetup) ═══
  sheets: {
    quickAdd: { title: 'משימה חדשה' },
    complete: { title: 'כל הכבוד, עוד משימה ירדה מהרשימה' },
    request: { title: 'לבקש מ…' },
    snooze: { title: 'דחייה' },
    jarSetup: { title: 'הצ׳ופר הבא' } // owner 4.2
  },

  // ═══ memory · owner 4.1 ══════════════════════════════════════════════════════
  memory: {
    title: 'זיכרון הבית'
  },

  // ═══ jar · owner 4.2 ═════════════════════════════════════════════════════════
  jar: {
    title: 'הצנצנת',
    celebration: 'הצנצנת התמלאה'
  },

  // ═══ household · owner 4.3 ═══════════════════════════════════════════════════
  household: {
    title: 'הבית שלנו'
  },

  // ═══ settings · owner 4.3 ════════════════════════════════════════════════════
  settings: {
    title: 'הגדרות'
  },

  // ═══ notifications · owner 5.1 (settings block, permission states, foreground) ═
  notifications: {
    title: 'התראות'
  },

  // ═══ setup · owner 3.1 (Firebase not configured) ═════════════════════════════
  setup: {
    title: 'האפליקציה עוד לא חוברה ל-Firebase'
  },

  // ═══ errors · owner 2.2 (RepoError copy) / 3.1 (sign-in, join) ═══════════════
  errors: {
    generic: 'משהו השתבש. נסו שוב.'
  },

  // ═══ dev · owner 1.4 (dev gallery; not shown in production) ══════════════════
  dev: {
    galleryTitle: 'גלריית רכיבים'
  }
} as const;

export type Strings = typeof he;
