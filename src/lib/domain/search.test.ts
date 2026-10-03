import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeHebrew, scoreQuery, searchDoneTasks, tokenize } from './search';
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
    expect(normalizeHebrew('\u200Fמצבר\u200E')).toBe('מצבר'); // RLM, LRM
    expect(normalizeHebrew('\u2067מצבר\u2069')).toBe('מצבר'); // RLI ... PDI
    expect(normalizeHebrew('מצ\u202Bבר\u202C')).toBe('מצבר'); // RLE ... PDF inside a word
  });

  it('turns zero-width characters into spaces (they separate words in pasted text)', () => {
    expect(normalizeHebrew('מצבר\u200Bמוסך')).toBe('מצבר מוסכ'); // zero-width space
    expect(normalizeHebrew('מצבר\u200Cמוסך\u200Dשמן')).toBe('מצבר מוסכ שמנ'); // ZWNJ, ZWJ
    expect(normalizeHebrew('\uFEFFמצבר\u2060מוסך')).toBe('מצבר מוסכ'); // BOM, word joiner
  });

  it('folds hyphens inside digit and Latin runs: 050-1234567 = 0501234567, Wi-Fi = wifi', () => {
    expect(normalizeHebrew('050-1234567')).toBe('0501234567');
    expect(normalizeHebrew('050\u20131234567')).toBe('0501234567'); // en dash
    expect(normalizeHebrew('03\u2011555\u20101234')).toBe('035551234'); // non-breaking hyphen, hyphen
    expect(normalizeHebrew('Wi-Fi')).toBe('wifi');
    expect(normalizeHebrew('a-b-c 4-x')).toBe('abc 4x');
  });

  it('keeps hyphens that touch Hebrew or spaces (they still split words)', () => {
    expect(normalizeHebrew('בית-ספר')).toBe('בית-ספר');
    expect(normalizeHebrew('050 - 1234567')).toBe('050 - 1234567');
    expect(normalizeHebrew('ת-5')).toBe('ת-5');
  });

  it('normalizes to NFC', () => {
    expect(normalizeHebrew('e\u0301')).toBe('\u00E9'); // e + combining acute -> é
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

  it('keeps hyphenated phone numbers and Latin words in one token', () => {
    expect(tokenize('משה 050-1234567')).toEqual(['משה', '0501234567']);
    expect(tokenize('סיסמת Wi-Fi')).toEqual(['סיסמת', 'wifi']);
  });

  it('splits on zero-width spaces', () => {
    expect(tokenize('מצבר\u200Bמוסך')).toEqual(['מצבר', 'מוסכ']);
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
    expect(matchesQuery('מצבר', 'במצב')).toBe(true); // prefix letter plus partial typing
    // ...but a prefix letter is only peeled when 3+ letters remain, so "במצ" is not "ב" + "מצ"
    expect(matchesQuery('מצבר', 'במצ')).toBe(false);
  });

  it('does NOT match the middle of a word', () => {
    expect(matchesQuery('החלפת', 'לפת')).toBe(false);
    expect(matchesQuery('טסט', 'סט')).toBe(false);
  });

  it('does not match unrelated words', () => {
    expect(matchesQuery('החלפת מצבר', 'מוסך')).toBe(false);
    expect(matchesQuery('', 'מצבר')).toBe(false);
  });

  it('peels a prefix letter only when at least 3 letters remain (precision)', () => {
    expect(matchesQuery('לבטל מנוי', 'שמן')).toBe(false); // not ש + "מנ"
    expect(matchesQuery('ספר על בישול', 'כסף')).toBe(false); // not כ + "סף"
    expect(matchesQuery('לשתול בחממה', 'לחם')).toBe(false); // not ל + "חם"
    expect(matchesQuery('ימי הולדת', 'מים')).toBe(false); // not מ + "ים"
    expect(matchesQuery('החלפת שמן', 'שמן')).toBe(true);
    expect(matchesQuery('להביא מים', 'במים')).toBe(true); // ב + "מים" keeps 3 letters
    expect(matchesQuery('בחממה', 'חממה')).toBe(true); // haystack side: ב + "חממה"
  });

  describe('suffix and construct-state fold (query tokens of 4+ letters)', () => {
    it('"החלפנו" (we replaced) finds "החלפת" (replacement of): both are החלפ-', () => {
      expect(matchesQuery('החלפת מצבר', 'החלפנו')).toBe(true);
      expect(matchesQuery('החלפת מצבר', 'החלפנו מצבר')).toBe(true);
      expect(matchesQuery('החלפת מצבר', 'החלפתי')).toBe(true);
    });

    it('construct state and plurals: בדיקה ~ בדיקת, צמיגים ~ צמיג, מסעדות ~ מסעדה', () => {
      expect(matchesQuery('בדיקת דם', 'בדיקה')).toBe(true);
      expect(matchesQuery('בדיקת דם', 'בדיקות')).toBe(true);
      expect(matchesQuery('החלפת צמיג', 'צמיגים')).toBe(true);
      expect(matchesQuery('מסעדה איטלקית', 'מסעדות')).toBe(true);
      expect(matchesQuery('תיקון ברז', 'תיקונים')).toBe(true);
    });

    it('applies to prefixed query words too', () => {
      expect(matchesQuery('בדיקת דם', 'בבדיקות')).toBe(true);
    });

    it('never folds below 3 letters, and never folds 3-letter words', () => {
      expect(matchesQuery('ספר', 'ספה')).toBe(false); // ספה is not folded to "ספ"
      expect(matchesQuery('שמש', 'שמה')).toBe(false);
    });

    it('a 3-letter stem only matches the same word with one of the suffixes, not any longer word', () => {
      expect(matchesQuery('החלפת מתנע', 'מתנה')).toBe(false); // מתנ- is not מתנע
      expect(matchesQuery('תיקון מנוע', 'מנוי')).toBe(false); // מנו- is not מנוע
      expect(matchesQuery('מתנות לחג', 'מתנה')).toBe(true); // מתנ + ות
      expect(matchesQuery('קניות לשבת', 'קניה')).toBe(true); // קני + ות
    });

    it('never drops haystack words as stopwords (האחרון stays searchable content)', () => {
      expect(matchesQuery('הטיפול האחרון', 'האחרונים')).toBe(true);
    });
  });

  describe('stopwords (dropped from the query, never from the haystack)', () => {
    const stopwords = [
      'מתי',
      'איפה',
      'איזה',
      'איזו',
      'אילו',
      'מי',
      'מה',
      'כמה',
      'למה',
      'של',
      'את',
      'עם',
      'על',
      'גם',
      'כבר',
      'פעם',
      'האחרון',
      'האחרונה'
    ];

    it('ignores Hebrew question and function words in the query', () => {
      for (const w of stopwords) expect(matchesQuery('החלפת מצבר', `${w} מצבר`)).toBe(true);
    });

    it('recognises them behind prefix letters: ובאיזה, ומתי, בפעם, וכבר', () => {
      for (const w of ['ובאיזה', 'ומתי', 'בפעם', 'וכבר', 'והאחרונה']) {
        expect(matchesQuery('החלפת מצבר', `מצבר ${w}`)).toBe(true);
      }
    });

    it('recognises a two-letter stopword behind ו: ומה, ומי, ועם, ושל', () => {
      for (const w of ['ומה', 'ומי', 'ועם', 'ושל']) {
        expect(matchesQuery('החלפת מצבר', `מצבר ${w}`)).toBe(true);
      }
    });

    it('keeps real words that only look like prefix + stopword (בעל, העם)', () => {
      expect(matchesQuery('החלפת מצבר', 'מצבר בעל')).toBe(false);
      expect(matchesQuery('שיחה עם בעל הבית', 'בעל')).toBe(true);
      expect(matchesQuery('החלפת מצבר', 'מצבר העם')).toBe(false);
    });

    it('a query of stopwords only matches everything, like an empty query', () => {
      expect(matchesQuery('החלפת מצבר', 'מתי? איפה?')).toBe(true);
    });
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

describe('scoreQuery (0 = no match; higher = better)', () => {
  it('scores each query token: exact 3, prefix (partial typing) 2, peeled or folded 1', () => {
    expect(scoreQuery('החלפת מצבר', 'מצבר')).toBe(3);
    expect(scoreQuery('מצברים לרכב', 'מצבר')).toBe(2);
    expect(scoreQuery('מוסך השרון', 'במוסך')).toBe(1); // the query lost its ב
    expect(scoreQuery('החלפת מצבר', 'החלפנו')).toBe(1); // folded
  });

  it("treats the haystack's own prefix letters as transparent (still exact)", () => {
    expect(scoreQuery('ביקור במוסך', 'מוסך')).toBe(3);
    expect(scoreQuery('ביקור במוסכים', 'מוסך')).toBe(2);
  });

  it('adds the token scores up, and is 0 as soon as one token does not match', () => {
    expect(scoreQuery('החלפת מצבר', 'מצבר החלפ')).toBe(5);
    expect(scoreQuery('החלפת מצבר', 'מתי החלפנו מצבר')).toBe(4); // stopword ignored
    expect(scoreQuery('החלפת מצבר', 'מצבר שמן')).toBe(0);
  });

  it('is positive for an empty (or stopword-only) query', () => {
    expect(scoreQuery('', '')).toBeGreaterThan(0);
    expect(scoreQuery('משהו', 'מתי')).toBeGreaterThan(0);
  });

  it('agrees with matchesQuery', () => {
    for (const [hay, q] of [
      ['החלפת מצבר', 'מצבר'],
      ['ספר', 'כסף'],
      ['מוסך השרון', 'במוסך']
    ] as const) {
      expect(matchesQuery(hay, q)).toBe(scoreQuery(hay, q) > 0);
    }
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
      place: 'מוסך השרון, כפר סבא',
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

  it('ACCEPTANCE: "מתי החלפנו מצבר ובאיזה מוסך?" finds the battery replacement', () => {
    expect(ids(searchDoneTasks(all, 'מתי החלפנו מצבר ובאיזה מוסך?'))).toEqual([battery.id]);
    expect(ids(searchDoneTasks(all, 'החלפנו מצבר'))).toEqual([battery.id]);
  });

  it('precision: short words do not match by peeling off a "prefix" (כסף is not כ + ספר)', () => {
    expect(searchDoneTasks(all, 'כסף')).toEqual([]); // gift notes say "ספר"
    expect(searchDoneTasks(all, 'שמן')).toEqual([]);
  });

  describe('ranking: match quality first, then newest completion', () => {
    const exactOld = done({ title: 'לא לשכוח לשים בחשבון', completedAt: 1_000 });
    const prefixMid = done({ title: 'סידור בחשבונות', completedAt: 2_000 });
    const peeledNew = done({ title: 'חשבון חשמל', completedAt: 3_000 });
    const peeledNewest = done({ title: 'חשבון מים', completedAt: 4_000 });

    it('exact > prefix > peeled/folded, newest first within a tier', () => {
      expect(
        ids(searchDoneTasks([peeledNew, prefixMid, peeledNewest, exactOld], 'בחשבון'))
      ).toEqual([exactOld.id, prefixMid.id, peeledNewest.id, peeledNew.id]);
    });

    it('an older exact match outranks a newer partial one', () => {
      const exact = done({ title: 'החלפת מצבר', completedAt: 1_000 });
      const partial = done({ title: 'מצברים במבצע', completedAt: 9_000 });
      expect(ids(searchDoneTasks([partial, exact], 'מצבר'))).toEqual([exact.id, partial.id]);
    });
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
