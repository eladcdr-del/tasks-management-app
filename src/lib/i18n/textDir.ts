// Direction for user-entered text (Blueprint §3 "Phase 1 council amendments": textDir).
//
// `dir="auto"` picks the direction from the FIRST strong character, so a Hebrew title that starts
// with a brand name ("IKEA להחזיר את המדף") turns LTR: it left-aligns and the words come out in
// the wrong order. In this Hebrew app any Hebrew letter means the text is Hebrew: 'rtl'. Text with
// no Hebrew at all ("Netflix", "050-1234567") keeps 'auto', so pure Latin still reads LTR.
//
//   <span dir={textDir(task.title)}>{task.title}</span>

/** Any letter of the Hebrew block (U+0590–U+05FF), including niqqud and final forms. */
const HEBREW = /[֐-׿]/;

export type TextDir = 'rtl' | 'auto';

/** 'rtl' when `text` contains any Hebrew letter, else 'auto' (also for empty / missing text). */
export function textDir(text: string | null | undefined): TextDir {
  return text && HEBREW.test(text) ? 'rtl' : 'auto';
}
