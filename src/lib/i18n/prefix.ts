// Hebrew one-letter prefixes (ל, מ, ב…) attach to the word after them: "לדני", "ביקשת מדני".
// Before anything that does not start with a Hebrew letter (a Latin name kept from the Google
// profile, a date in digits) they take a hyphen instead: "ל-Michal", "מ-Dana", "ל-15/10". Glued to
// a Latin name the prefix also lands on the wrong side of it on screen ("Michalמ").
//
// Use it for every prefix glued to a name or a date: `ביקשת ${prefixed('מ', owner.displayName)}`.

/** Starts with a letter of the Hebrew block (U+0590–U+05FF). */
const HEBREW_START = /^[֐-׿]/;

/** `prefixed('ל', 'דני')` → "לדני"; `prefixed('מ', 'Michal')` → "מ-Michal". */
export function prefixed(prefix: string, word: string): string {
  return HEBREW_START.test(word) ? `${prefix}${word}` : `${prefix}-${word}`;
}
