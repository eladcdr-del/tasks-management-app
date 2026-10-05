import { describe, expect, it } from 'vitest';
import { cleanLine, isMultiLine, LIST_MAX, removeLines, splitList, TITLE_MAX } from './splitList';
import { parseQuickAdd } from './quickAdd';

const texts = (raw: string) => splitList(raw).items.map((i) => i.text);

describe('splitList: one task per line', () => {
  it('splits on every kind of line break and keeps commas inside a line', () => {
    expect(texts('לקנות חלב, לחם וביצים\r\nלתקן ברז\rלהחזיר ספרים\u2028לשלם ארנונה')).toEqual([
      'לקנות חלב, לחם וביצים',
      'לתקן ברז',
      'להחזיר ספרים',
      'לשלם ארנונה'
    ]);
  });

  it('skips blank lines and whitespace-only lines, and remembers each item’s input line', () => {
    const r = splitList('\n\nלקנות חלב\n   \n\t\nלתקן ברז\n\n');
    expect(r.items).toEqual([
      { text: 'לקנות חלב', lines: [2] },
      { text: 'לתקן ברז', lines: [5] }
    ]);
    expect(r.overflow).toEqual([]);
  });

  it('trims and collapses spaces, tabs and NBSP', () => {
    expect(texts('   לקנות \t  חלב\u00A0\u00A0טרי   ')).toEqual(['לקנות חלב טרי']);
  });

  it('gives nothing for an empty or blank input', () => {
    expect(splitList('')).toEqual({ items: [], overflow: [] });
    expect(splitList(' \n \n')).toEqual({ items: [], overflow: [] });
  });
});

describe('splitList: list markers', () => {
  it('a WhatsApp list with dashes, bullets and stars', () => {
    const raw = [
      'מה צריך לעשות השבוע:',
      '- לקנות מתנה לדני',
      '-לתקן את הברז במטבח',
      '• לשלם ארנונה',
      '* להזמין טכנאי למזגן',
      '· להחזיר את הספרים לספרייה',
      '– לנקות את המרפסת',
      '— לקבוע תור לרופא שיניים',
      '▪️ לסדר את המחסן',
      '➤ לקנות נורות',
      '→ לכבס וילונות'
    ].join('\n');
    expect(texts(raw)).toEqual([
      'לקנות מתנה לדני',
      'לתקן את הברז במטבח',
      'לשלם ארנונה',
      'להזמין טכנאי למזגן',
      'להחזיר את הספרים לספרייה',
      'לנקות את המרפסת',
      'לקבוע תור לרופא שיניים',
      'לסדר את המחסן',
      'לקנות נורות',
      'לכבס וילונות'
    ]);
  });

  it('numbered lists: 1. 1) (1) 1 - 1: and keycaps', () => {
    expect(
      texts(
        '1. לקנות חלב\n2) לתקן ברז\n(3) לשלם חשמל\n4 - לנקות חלונות\n5: לסדר ארון\n6️⃣ לכבס\n12.לשטוף רכב'
      )
    ).toEqual([
      'לקנות חלב',
      'לתקן ברז',
      'לשלם חשמל',
      'לנקות חלונות',
      'לסדר ארון',
      'לכבס',
      'לשטוף רכב'
    ]);
  });

  it('Hebrew and Latin letter numbering', () => {
    expect(texts('א. לקנות חלב\nב) לתקן ברז\na. call the plumber\nB) fix the door')).toEqual([
      'לקנות חלב',
      'לתקן ברז',
      'call the plumber',
      'fix the door'
    ]);
  });

  it('a number that belongs to the task stays', () => {
    expect(
      texts('2 ק"ג עגבניות\n1.5 ליטר חלב\n10.10 תור לרופא\n3-4 ביצים\n9:00 פגישה עם המורה')
    ).toEqual([
      '2 ק"ג עגבניות',
      '1.5 ליטר חלב',
      '10.10 תור לרופא',
      '3-4 ביצים',
      '9:00 פגישה עם המורה'
    ]);
  });

  it('notes-app checklists: ☐ ☑ ✅ ✔ ✓ ❌ [ ] [x]', () => {
    const raw = [
      '☐ לקנות חלב',
      '☑ לתקן ברז',
      '✅ לשלם ארנונה',
      '✔️ להחזיר ספרים',
      '✓ לנקות מרפסת',
      '❌ לבטל מנוי',
      '[ ] לקבוע תור',
      '[x] לשטוף רכב',
      '- [ ] לסדר מחסן',
      '[] להזמין טכנאי'
    ].join('\n');
    expect(texts(raw)).toEqual([
      'לקנות חלב',
      'לתקן ברז',
      'לשלם ארנונה',
      'להחזיר ספרים',
      'לנקות מרפסת',
      'לבטל מנוי',
      'לקבוע תור',
      'לשטוף רכב',
      'לסדר מחסן',
      'להזמין טכנאי'
    ]);
  });

  it('emoji bullets, with or without a space, including sequences and skin tones', () => {
    expect(
      texts('🧹 לנקות את הבית\n🛒לקנות חלב\n👉🏽 לשלם חשמל\n👨‍👩‍👧 ארוחה משפחתית\n🔹 לתקן ברז')
    ).toEqual(['לנקות את הבית', 'לקנות חלב', 'לשלם חשמל', 'ארוחה משפחתית', 'לתקן ברז']);
  });

  it('peels several markers in a row and keeps emoji inside the text', () => {
    expect(texts('1. ☐ לקנות חלב 🥛\n- ✅ 🧺 לכבס')).toEqual(['לקנות חלב 🥛', 'לכבס']);
  });

  it('unwraps WhatsApp *bold*, _italic_ and ~strike~ lines', () => {
    expect(texts('*לקנות חלב*\n_לתקן ברז_\n~לשלם ארנונה~\n- *להחזיר ספרים*')).toEqual([
      'לקנות חלב',
      'לתקן ברז',
      'לשלם ארנונה',
      'להחזיר ספרים'
    ]);
  });

  it('drops the header of copied WhatsApp messages', () => {
    expect(
      texts(
        [
          '[9:15, 4.10.2026] מיכל: לקנות חלב',
          '[4/10/26, 09:16:02] דני כהן: לתקן את הברז',
          '04/10/2026, 09:17 - מיכל: לשלם ארנונה',
          '[21:40, 3.10.2026] +972 50-123-4567: לאסוף חבילה'
        ].join('\n')
      )
    ).toEqual(['לקנות חלב', 'לתקן את הברז', 'לשלם ארנונה', 'לאסוף חבילה']);
  });

  it('keeps a colon inside the task and a bracket that is not a message header', () => {
    expect(texts('לקנות: חלב ולחם\n[דחוף] לתקן ברז')).toEqual([
      'לקנות: חלב ולחם',
      '[דחוף] לתקן ברז'
    ]);
  });
});

describe('splitList: lines that are not tasks', () => {
  it('ignores lines with only punctuation, symbols or emoji', () => {
    expect(texts('---\n***\n...\n—\n🎉🎉\n• \n1.\n☐\nלקנות חלב\n===\n!!!')).toEqual(['לקנות חלב']);
  });

  it('ignores headings that end with a colon', () => {
    expect(texts('קניות:\nחלב\nלחם\n🛒 לסופר:\nביצים')).toEqual(['חלב', 'לחם', 'ביצים']);
  });
});

describe('splitList: direction marks', () => {
  it('drops LRM / RLM / isolates / BOM / zero-width spaces and keeps the words', () => {
    const raw =
      '\uFEFF\u200F- לקנות חלב\u200F\n\u20671. לתקן ברז\u2069\n\u202Bלשלם\u200B ארנונה\u202C\n\u061C• לכבס';
    expect(texts(raw)).toEqual(['לקנות חלב', 'לתקן ברז', 'לשלם ארנונה', 'לכבס']);
  });

  it('keeps mixed Hebrew and English lines intact', () => {
    expect(texts('- לקנות iPhone charger\n- call Dani')).toEqual([
      'לקנות iPhone charger',
      'call Dani'
    ]);
  });
});

describe('splitList: duplicates', () => {
  it('keeps the first of identical lines and records every source line', () => {
    const r = splitList('לקנות חלב\nלתקן ברז\n- לקנות חלב\nלקנות  חלב.\nלתקן ברז');
    expect(r.items).toEqual([
      { text: 'לקנות חלב', lines: [0, 2, 3] },
      { text: 'לתקן ברז', lines: [1, 4] }
    ]);
  });

  it('compares Latin text without case', () => {
    expect(texts('Call Dani\ncall dani\nCALL DANI')).toEqual(['Call Dani']);
  });

  it('different lines that look alike are not merged', () => {
    expect(texts('לקנות חלב\nלקנות חלב מחר')).toEqual(['לקנות חלב', 'לקנות חלב מחר']);
  });
});

describe('splitList: limits', () => {
  it(`caps at ${LIST_MAX} items and returns the rest as overflow, in order`, () => {
    const raw = Array.from({ length: 58 }, (_, i) => `משימה מספר ${i + 1}`).join('\n');
    const r = splitList(raw);
    expect(r.items).toHaveLength(LIST_MAX);
    expect(r.items[49]!.text).toBe('משימה מספר 50');
    expect(r.overflow.map((i) => i.text)).toEqual(
      Array.from({ length: 8 }, (_, i) => `משימה מספר ${i + 51}`)
    );
  });

  it('duplicates do not count towards the cap', () => {
    const raw = ['משימה ראשונה', ...Array.from({ length: 60 }, () => 'אותה משימה')].join('\n');
    const r = splitList(raw, 2);
    expect(r.items.map((i) => i.text)).toEqual(['משימה ראשונה', 'אותה משימה']);
    expect(r.overflow).toEqual([]);
  });

  it('accepts a custom cap', () => {
    const r = splitList('אחת\nשתיים\nשלוש', 2);
    expect(r.items.map((i) => i.text)).toEqual(['אחת', 'שתיים']);
    expect(r.overflow).toEqual([{ text: 'שלוש', lines: [2] }]);
  });

  it(`clips a very long line to ${TITLE_MAX} characters without splitting an emoji`, () => {
    const long = 'א'.repeat(TITLE_MAX + 50);
    expect(texts(long)[0]).toHaveLength(TITLE_MAX);
    const edge = `${'ב'.repeat(TITLE_MAX - 1)}🥛 ועוד`;
    const [clipped] = texts(edge);
    expect(clipped).toBe('ב'.repeat(TITLE_MAX - 1));
  });
});

describe('cleanLine', () => {
  it('returns the cleaned text, or "" for a line with no task', () => {
    expect(cleanLine('  - ☐ לקנות חלב  ')).toBe('לקנות חלב');
    expect(cleanLine('••• ')).toBe('');
    expect(cleanLine('רשימה:')).toBe('');
  });

  it('peels any number of markers', () => {
    expect(cleanLine(`${'- '.repeat(20)}לקנות`)).toBe('לקנות');
  });
});

describe('isMultiLine', () => {
  it('is true for two or more lines with words', () => {
    expect(isMultiLine('לקנות חלב\nלתקן ברז')).toBe(true);
    expect(isMultiLine('1. לקנות חלב\r\n\r\n2. לתקן ברז\n')).toBe(true);
  });

  it('is false for one line, even with blank lines or a trailing break around it', () => {
    expect(isMultiLine('לקנות חלב')).toBe(false);
    expect(isMultiLine('\nלקנות חלב\n\n')).toBe(false);
    expect(isMultiLine('לקנות חלב\n---\n🎉')).toBe(false);
    expect(isMultiLine('')).toBe(false);
  });
});

describe('removeLines', () => {
  it('drops the given input lines and keeps the rest in order', () => {
    expect(removeLines('א\nב\r\nג\nד', [1, 3])).toBe('א\nג');
    expect(removeLines('א\nב', [])).toBe('א\nב');
    expect(removeLines('א', [0])).toBe('');
  });

  it('the lines of a split item round-trip through removeLines', () => {
    const raw = '- לקנות חלב\nלתקן ברז\n• לקנות חלב';
    const [milk] = splitList(raw).items;
    expect(splitList(removeLines(raw, milk!.lines)).items.map((i) => i.text)).toEqual(['לתקן ברז']);
  });
});

describe('a cleaned line goes through the quick-add parser like a single quick add', () => {
  const now = new Date('2026-10-04T09:00:00+03:00');

  it('dates, priority and category are still recognised after the marker is gone', () => {
    const [a, b] = texts('1. לתקן את הברז מחר דחוף\n☐ להחזיר מכנסיים עד יום חמישי');
    const pa = parseQuickAdd(a!, now, 'Asia/Jerusalem');
    expect(pa).toMatchObject({
      title: 'לתקן את הברז',
      scheduledFor: '2026-10-05',
      priority: 'urgent'
    });
    const pb = parseQuickAdd(b!, now, 'Asia/Jerusalem');
    expect(pb).toMatchObject({ dueDate: '2026-10-08', categoryId: 'returns' });
  });
});
