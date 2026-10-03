import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeHebrew, searchDoneTasks, tokenize } from './search';
import type { Task } from './types';

describe('normalizeHebrew', () => {
  it('strips niqqud (vowel points)', () => {
    expect(normalizeHebrew('מַצְבֵּר')).toBe('מצבר'); // final ר is untouched; only points removed
    expect(normalizeHebrew('שָׁלוֹם')).toBe('שלומ'); // shin dot + qamats + holam, then final-mem folded
  });

  it("strips cantillation marks (te'amim)", () => {
    expect(normalizeHebrew('בְּרֵאשִׁ֖ית')).toBe('בראשית');
  });

  it('removes geresh, gershayim and quote characters inside words', () => {
    expect(normalizeHebrew("פנצ'ר")).toBe('פנצר'); // ASCII apostrophe
    expect(normalizeHebrew('פנצ׳ר')).toBe('פנצר'); // Hebrew geresh U+05F3
    expect(normalizeHebrew('בסופ"ש')).toBe('בסופש'); // ASCII double quote
    expect(normalizeHebrew('צה״ל')).toBe('צהל'); // gershayim U+05F4
    expect(normalizeHebrew('״מצבר״ ‘חדש’ “טוב”')).toBe('מצבר חדש טוב'); // typographic quotes
  });

  it('maps final letters to their regular forms', () => {
    expect(normalizeHebrew('ך ם ן ף ץ')).toBe('כ מ נ פ צ');
    expect(normalizeHebrew('מוסך')).toBe('מוסכ');
    expect(normalizeHebrew('חלון')).toBe('חלונ');
    expect(normalizeHebrew('סוף')).toBe('סופ');
    expect(normalizeHebrew('ארץ')).toBe('ארצ');
  });

  it('lower-cases Latin letters and leaves digits alone', () => {
    expect(normalizeHebrew('Netflix 2026')).toBe('netflix 2026');
  });

  it('collapses whitespace runs and trims', () => {
    expect(normalizeHebrew('  החלפת \n\t מצבר  ')).toBe('החלפת מצבר');
  });

  it('treats the Hebrew hyphen (maqaf) as a space', () => {
    expect(normalizeHebrew('בית־ספר')).toBe('בית ספר');
  });

  it('removes invisible bidi marks that sneak in from copy/paste', () => {
    expect(normalizeHebrew('‏מצבר‎')).toBe('מצבר');
    expect(normalizeHebrew('⁧מצבר⁩')).toBe('מצבר');
  });

  it('normalizes to NFC', () => {
    expect(normalizeHebrew('é')).toBe('é'); // e + combining acute -> é
  });

  it('is idempotent and handles the empty string', () => {
    const once = normalizeHebrew("מַצְבֵּר פנצ'ר Netflix");
    expect(normalizeHebrew(once)).toBe(once);
    expect(normalizeHebrew('')).toBe('');
  });
});

describe('tokenize', () => {
  it('normalizes and splits on anything that is not a letter or digit', () => {
    expect(tokenize('החלפת מצבר, במוסך!')).toEqual(['החלפת', 'מצבר', 'במוסכ']);
  });

  it('keeps Latin words (lower-cased) and digits', () => {
    expect(tokenize('Netflix לבטל מנוי')).toEqual(['netflix', 'לבטל', 'מנוי']);
    expect(tokenize('טסט 15/10')).toEqual(['טסט', '15', '10']);
  });

  it('splits hyphenated words', () => {
    expect(tokenize('בית-ספר')).toEqual(['בית', 'ספר']);
  });

  it('gives no tokens for empty or punctuation-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('  ?! - ')).toEqual([]);
  });
});

describe('matchesQuery', () => {
  it('matches an exact word: "מצבר" in "החלפת מצבר"', () => {
    expect(matchesQuery('החלפת מצבר', 'מצבר')).toBe(true);
  });

  it('strips a leading prefix letter from the query: "במוסך" matches "מוסך השרון"', () => {
    expect(matchesQuery('מוסך השרון', 'במוסך')).toBe(true);
  });

  it('strips a leading prefix letter from the haystack: "מוסך" matches "ביקור במוסך"', () => {
    expect(matchesQuery('ביקור במוסך', 'מוסך')).toBe(true);
  });

  it('recognises every prefix letter ו ה ב ל מ ש כ', () => {
    for (const p of ['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ']) {
      expect(matchesQuery('חדר מוסך', `${p}מוסך`)).toBe(true);
      expect(matchesQuery(`חדר ${p}מוסך`, 'מוסך')).toBe(true);
    }
  });

  it('allows up to two stacked prefix letters, not three', () => {
    expect(matchesQuery('מוסך', 'ובמוסך')).toBe(true); // ו + ב
    expect(matchesQuery('מוסך', 'שבמוסך')).toBe(true); // ש + ב
    expect(matchesQuery('מוסך', 'כשבמוסך')).toBe(false); // three prefixes is not Hebrew
    expect(matchesQuery('ובמוסך', 'מוסך')).toBe(true);
  });

  it('ignores final-letter forms, niqqud and quotes on either side', () => {
    expect(matchesQuery('מוסך השרון', 'מוסכ')).toBe(true);
    expect(matchesQuery('מוסך', 'מוֹסָךְ')).toBe(true);
    expect(matchesQuery("החלפת פנצ'ר", 'פנצר')).toBe(true);
    expect(matchesQuery('שלום', 'שלומ')).toBe(true);
  });

  it('requires EVERY query token to match some haystack token, in any order', () => {
    expect(matchesQuery('החלפת מצבר', 'החלפת מצבר')).toBe(true);
    expect(matchesQuery('החלפת מצבר', 'מצבר החלפת')).toBe(true);
    expect(matchesQuery('החלפת מצבר', 'מצבר שמן')).toBe(false);
  });

  it('matches prefixes for partial typing', () => {
    expect(matchesQuery('החלפת מצבר', 'מצב')).toBe(true);
    expect(matchesQuery('החלפת מצבר', 'החלפ')).toBe(true);
    expect(matchesQuery('החלפת מצבר', 'מ')).toBe(true);
    expect(matchesQuery('החלפת במצבר', 'מצ')).toBe(true); // partial typing against a prefixed word
    expect(matchesQuery('מצבר', 'במצ')).toBe(true); // prefix letter plus partial typing
  });

  it('does NOT match the middle of a word', () => {
    expect(matchesQuery('החלפת', 'לפת')).toBe(false);
    expect(matchesQuery('טסט', 'סט')).toBe(false);
  });

  it('does not match unrelated words', () => {
    expect(matchesQuery('החלפת מצבר', 'מוסך')).toBe(false);
    expect(matchesQuery('', 'מצבר')).toBe(false);
  });

  it('DECISION: no shared-root matching, so "החלפנו" does not match "החלפת"', () => {
    // Different inflections of החלפה (we replaced / replacement of) are different words here.
    expect(matchesQuery('החלפת מצבר', 'החלפנו')).toBe(false);
    expect(matchesQuery('החלפת מצבר', 'החלפנו מצבר')).toBe(false);
    // The noun the user actually wants still finds it, with or without the verb they remember:
    expect(matchesQuery('החלפת מצבר', 'מצבר')).toBe(true);
    // ...and typing the stem finds it (partial typing, not root matching):
    expect(matchesQuery('החלפת מצבר', 'החלפ מצבר')).toBe(true);
  });

  it('matches Latin words case-insensitively', () => {
    expect(matchesQuery('Netflix לבטל מנוי', 'netflix')).toBe(true);
    expect(matchesQuery('netflix', 'NETFL')).toBe(true);
  });

  it('matches digits', () => {
    expect(matchesQuery('טסט שנתי 2026', '2026')).toBe(true);
  });

  it('an empty or punctuation-only query matches everything', () => {
    expect(matchesQuery('החלפת מצבר', '')).toBe(true);
    expect(matchesQuery('החלפת מצבר', '  ?? ')).toBe(true);
    expect(matchesQuery('', '')).toBe(true);
  });
});

describe('searchDoneTasks', () => {
  let n = 0;
  function done(over: Partial<Task>): Task {
    n += 1;
    return {
      id: `d${n}`,
      title: `משימה ${n}`,
      notes: '',
      categoryId: null,
      priority: 'normal',
      ownerId: 'u1',
      requestedBy: null,
      requestedAt: null,
      createdBy: 'u1',
      createdAt: 100,
      updatedBy: 'u1',
      updatedAt: 100,
      scheduledFor: null,
      dueDate: null,
      dueTime: null,
      hardDeadline: false,
      recurrence: null,
      seriesId: null,
      status: 'done',
      snoozeCount: 0,
      lastSnoozedAt: null,
      completedAt: 1_000,
      completedBy: 'u1',
      completion: null,
      ...over
    };
  }

  const battery = done({
    title: 'החלפת מצבר',
    categoryId: 'car',
    completedAt: 3_000,
    completedBy: 'u1',
    completion: {
      note: 'סוף סוף הוחלף',
      cost: 450,
      place: 'מוסך השרון',
      contact: 'יוסי',
      photoIds: []
    }
  });
  const test = done({
    title: 'טסט שנתי',
    categoryId: 'car',
    completedAt: 5_000,
    completedBy: 'u2',
    completion: { note: '', cost: 600, place: 'מכון הרישוי', contact: '', photoIds: [] }
  });
  const gift = done({
    title: 'לקנות מתנה לדנה',
    notes: 'ספר על בישול',
    categoryId: 'shopping',
    completedAt: 4_000,
    completedBy: 'u1'
  });
  const leak = done({
    title: 'תיקון נזילה',
    categoryId: 'home',
    completedAt: 2_000,
    completedBy: 'u2',
    completion: { note: '', cost: null, place: '', contact: 'אינסטלטור משה', photoIds: [] }
  });
  const stillOpen = done({
    title: 'החלפת מצבר נוסף',
    status: 'open',
    completedAt: null,
    completedBy: null
  });
  const all = [battery, test, gift, leak, stillOpen];
  const ids = (ts: Task[]) => ts.map((t) => t.id);

  it('finds "מצבר" in the title of "החלפת מצבר"', () => {
    expect(ids(searchDoneTasks(all, 'מצבר'))).toEqual([battery.id]);
  });

  it('finds "במוסך" through the completion place "מוסך השרון"', () => {
    expect(ids(searchDoneTasks(all, 'במוסך'))).toEqual([battery.id]);
  });

  it('searches completion note, place and contact, and the task notes', () => {
    expect(ids(searchDoneTasks(all, 'הוחלף'))).toEqual([battery.id]); // completion.note
    expect(ids(searchDoneTasks(all, 'הרישוי'))).toEqual([test.id]); // completion.place
    expect(ids(searchDoneTasks(all, 'משה'))).toEqual([leak.id]); // completion.contact
    expect(ids(searchDoneTasks(all, 'יוסי'))).toEqual([battery.id]); // completion.contact
    expect(ids(searchDoneTasks(all, 'בישול'))).toEqual([gift.id]); // task notes
  });

  it('DECISION: "החלפנו מצבר" finds nothing because החלפנו is not החלפת', () => {
    expect(searchDoneTasks(all, 'החלפנו מצבר')).toEqual([]);
  });

  it('matches across fields: each token may hit a different field', () => {
    expect(ids(searchDoneTasks(all, 'מצבר יוסי'))).toEqual([battery.id]);
    expect(ids(searchDoneTasks(all, 'מצבר משה'))).toEqual([]);
  });

  it('only returns completed tasks', () => {
    expect(ids(searchDoneTasks(all, 'החלפת'))).toEqual([battery.id]); // not stillOpen
    expect(searchDoneTasks([stillOpen], '')).toEqual([]);
  });

  it('sorts by completedAt, newest first', () => {
    expect(ids(searchDoneTasks(all, ''))).toEqual([test.id, gift.id, battery.id, leak.id]);
  });

  it('filters by category', () => {
    expect(ids(searchDoneTasks(all, '', { categoryId: 'car' }))).toEqual([test.id, battery.id]);
    expect(ids(searchDoneTasks(all, '', { categoryId: 'health' }))).toEqual([]);
  });

  it('filters by the member who completed it (completedBy, not the owner)', () => {
    expect(ids(searchDoneTasks(all, '', { memberId: 'u2' }))).toEqual([test.id, leak.id]);
    const swapped = done({ ownerId: 'u1', completedBy: 'u2', title: 'כביסה' });
    expect(ids(searchDoneTasks([swapped], '', { memberId: 'u1' }))).toEqual([]);
    expect(ids(searchDoneTasks([swapped], '', { memberId: 'u2' }))).toEqual([swapped.id]);
  });

  it('combines query and both filters', () => {
    expect(ids(searchDoneTasks(all, 'טסט', { categoryId: 'car', memberId: 'u2' }))).toEqual([
      test.id
    ]);
    expect(ids(searchDoneTasks(all, 'טסט', { categoryId: 'car', memberId: 'u1' }))).toEqual([]);
    expect(ids(searchDoneTasks(all, '', { categoryId: 'car', memberId: 'u1' }))).toEqual([
      battery.id
    ]);
  });

  it('copes with tasks that have no documentation or no completedAt', () => {
    const bare = done({ title: 'כביסה', completion: null, completedAt: null });
    const out = searchDoneTasks([bare, battery], '');
    expect(ids(out)).toEqual([battery.id, bare.id]); // undated sorts last
    expect(ids(searchDoneTasks([bare], 'כביסה'))).toEqual([bare.id]);
  });

  it('keeps several undated tasks together at the end, in input order, whatever the input order', () => {
    const bare1 = done({ title: 'כביסה', completedAt: null });
    const bare2 = done({ title: 'ניקיון', completedAt: null });
    expect(ids(searchDoneTasks([bare1, battery, bare2], ''))).toEqual([
      battery.id,
      bare1.id,
      bare2.id
    ]);
    expect(ids(searchDoneTasks([battery, bare2, bare1], ''))).toEqual([
      battery.id,
      bare2.id,
      bare1.id
    ]);
    expect(ids(searchDoneTasks([bare1, bare2, battery], ''))).toEqual([
      battery.id,
      bare1.id,
      bare2.id
    ]);
  });

  it('keeps input order for equal completedAt (stable)', () => {
    const a = done({ title: 'אחת', completedAt: 7 });
    const b = done({ title: 'שתיים', completedAt: 7 });
    expect(ids(searchDoneTasks([a, b], ''))).toEqual([a.id, b.id]);
  });

  it('does not mutate its input', () => {
    const input = [leak, battery];
    searchDoneTasks(input, '');
    expect(ids(input)).toEqual([leak.id, battery.id]);
  });
});
