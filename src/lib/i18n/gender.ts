// owner: step 1.1 — only that step edits this file
//
// Gendered strings. Hebrew verbs/adjectives agree with the person: f = נקבה, m = זכר,
// n = neutral (לוקח/ת). "Me" strings use the viewer's addressAs ("אני לוקחת"); actor phrases use
// the ACTOR's addressAs ("דני לקח", "מיכל ביקשה"). Re-exported by he.ts, so
// `import { gendered, form } from '$lib/i18n/he'` keeps working.

import type { AddressAs } from '../domain/types';

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
