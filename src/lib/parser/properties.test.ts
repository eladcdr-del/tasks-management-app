// Property tests for the quick-add parser (step 1.3 QA, M7):
//   1. a known date phrase inserted anywhere into random noun text yields exactly that date;
//   2. the title never contains consumed text;
//   3. dismissing any chip and re-parsing gives fields, hardDeadline and title that agree.
import { describe, expect, it } from 'vitest';
import { parseQuickAdd, rebuildTitle, type ParseResult } from './quickAdd';

/** Sunday 2026-10-04, 09:00 in Asia/Jerusalem. */
const NOW = new Date('2026-10-04T06:00:00Z');
const TZ = 'Asia/Jerusalem';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: () => number, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)] as T;

/** Everyday nouns with no date, time, priority or category meaning of their own. */
const NOUNS = [
  'חלב',
  'לחם',
  'ספר',
  'שולחן',
  'כיסא',
  'מכתב',
  'עציץ',
  'גינה',
  'מטבח',
  'ארון',
  'חלון',
  'דלת',
  'מפתח',
  'כביסה',
  'כלים',
  'מגבת',
  'מנורה',
  'שטיח',
  'מדף',
  'קופסה',
  'מברשת',
  'סבון',
  'עיתון',
  'תמונה',
  'מזוודה',
  'כרית',
  'שמיכה',
  'צלחת',
  'Dana',
  'iPad'
];

type DateField = 'scheduledFor' | 'dueDate';
const PHRASES: [phrase: string, field: DateField, iso: string][] = [
  ['מחר', 'scheduledFor', '2026-10-05'],
  ['מחרתיים', 'scheduledFor', '2026-10-06'],
  ['ביום חמישי', 'scheduledFor', '2026-10-08'],
  ["ביום ה'", 'scheduledFor', '2026-10-08'],
  ['בשבוע הבא', 'scheduledFor', '2026-10-17'], // a week plan ending next week's Saturday
  ['בעוד שבועיים', 'scheduledFor', '2026-10-18'],
  ['בעוד 3 ימים', 'scheduledFor', '2026-10-07'],
  ['ב-15/10', 'scheduledFor', '2026-10-15'],
  ['בתאריך 20/10', 'scheduledFor', '2026-10-20'],
  ['15 באוקטובר', 'scheduledFor', '2026-10-15'],
  ['בסוף החודש', 'scheduledFor', '2026-10-31'],
  ['בסוף החודש הבא', 'scheduledFor', '2026-11-30'],
  ['ביום שלישי בשבוע הבא', 'scheduledFor', '2026-10-13'],
  ['ב-10 לחודש', 'scheduledFor', '2026-10-10'],
  ['עד מחר', 'dueDate', '2026-10-05'],
  ['עד יום חמישי', 'dueDate', '2026-10-08'],
  ['עד 15/10', 'dueDate', '2026-10-15'],
  ['עד ה-10', 'dueDate', '2026-10-10'],
  ['עד סוף היום', 'dueDate', '2026-10-04'],
  ['לא יאוחר מ-20/10', 'dueDate', '2026-10-20']
];

describe('property: a date phrase inserted into random noun text', () => {
  it('yields exactly that date, and a title made of the nouns alone', () => {
    const rng = mulberry32(4102026);
    for (let i = 0; i < 1500; i++) {
      const nouns = Array.from({ length: 1 + Math.floor(rng() * 6) }, () => pick(rng, NOUNS));
      const [phrase, field, iso] = pick(rng, PHRASES);
      const words = [...nouns];
      words.splice(Math.floor(rng() * (nouns.length + 1)), 0, phrase);
      const input = words.join(' ');
      const r = parseQuickAdd(input, NOW);
      const other: DateField = field === 'dueDate' ? 'scheduledFor' : 'dueDate';
      expect(r[field], input).toBe(iso);
      expect(r[other], input).toBeUndefined();
      expect(r.title, input).toBe(nouns.join(' '));
      expect(
        r.matches.map((m) => m.text),
        input
      ).toEqual([phrase]);
    }
  });
});

// ───────────────────────────── random inputs from the parser's own vocabulary ─────────────────────────────

const VOCAB = [
  ...NOUNS.slice(0, 8),
  'מחר',
  'היום',
  'הערב',
  'עד',
  'ב',
  'ו',
  'בשעה',
  '5',
  '17:30',
  '5:30',
  '15/10',
  '1/3',
  '2.5',
  'ביום',
  'יום',
  "ה'",
  'שלישי',
  'בשני',
  'בשבת',
  'השבוע',
  'סוף',
  'תחילת',
  'החודש',
  'הבא',
  'שבוע',
  'בעוד',
  'שבועיים',
  'בבוקר',
  'בערב',
  'בין',
  'ל-12:00',
  '!',
  '!!',
  'דחוף',
  'חשוב',
  'מאוד',
  'סופר',
  'לא',
  'כל',
  'שבועי',
  'לשלם',
  'להחזיר',
  'חולצה',
  'מצבר',
  'שמן',
  'תור',
  'רופא',
  'באוקטובר',
  'ה-10',
  'לחודש',
  'מועד',
  'אחרון',
  'תזכיר',
  'לי',
  'לא יאוחר מ-',
  '(',
  ')',
  '"',
  'Netflix'
];

function randomInput(rng: () => number): string {
  const n = 1 + Math.floor(rng() * 9);
  let s = '';
  for (let i = 0; i < n; i++) s += pick(rng, VOCAB) + pick(rng, [' ', ' ', ' ', '-', ', ', ' - ']);
  return s;
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The fields, the hard flag and the title agree with the matches, and no dismissed key shows. */
function assertConsistent(input: string, r: ParseResult, dismissed: readonly string[]): void {
  const ctx = `${JSON.stringify(input)} minus ${JSON.stringify(dismissed)} => ${JSON.stringify(r)}`;
  const byField = new Map<string, number>();
  for (const m of r.matches) {
    expect(dismissed, ctx).not.toContain(m.key);
    expect(m.key, ctx).toBe(`${m.kind}:${m.key.slice(m.kind.length + 1)}`);
    expect(m.label.length, ctx).toBeGreaterThan(0);
    byField.set(m.field, (byField.get(m.field) ?? 0) + 1);
  }
  for (const count of byField.values()) expect(count, ctx).toBe(1);
  const valueOf = (field: string) => r.matches.find((m) => m.field === field)?.value;

  const implied = r.matches.flatMap((m) => (m.alsoSets ? [m.alsoSets.scheduledFor] : []));
  expect(implied.length, ctx).toBeLessThanOrEqual(1);
  expect(r.scheduledFor, ctx).toBe(valueOf('scheduledFor') ?? implied[0]);
  if (valueOf('scheduledFor') !== undefined) expect(implied, ctx).toEqual([]);
  expect(r.dueDate, ctx).toBe(valueOf('dueDate'));
  expect(r.dueTime, ctx).toBe(valueOf('dueTime'));
  expect(r.priority, ctx).toBe(valueOf('priority'));
  expect(r.categoryId, ctx).toBe(valueOf('categoryId'));
  expect(r.recurrence, ctx).toEqual(valueOf('recurrence'));
  const hardChip = r.matches.some((m) => m.kind === 'due' && m.hard === true);
  expect(r.hardDeadline === true, ctx).toBe(hardChip);
  for (const m of r.matches) if (m.kind !== 'due') expect(m.hard, ctx).toBeUndefined();

  expect(r.title, ctx).toBe(input.trim() === '' ? '' : rebuildTitle(input, r.matches));
}

/** The title never contains a consumed phrase (unless everything was consumed: then it is the raw input). */
function assertTitleClean(input: string, r: ParseResult): void {
  if (r.title === collapse(input)) return;
  for (const m of r.matches) {
    const spans = [m, ...(m.extra ?? [])];
    for (const s of m.kind === 'category' ? [] : spans) {
      const unique = input.indexOf(s.text) === s.start && input.indexOf(s.text, s.start + 1) < 0;
      if (unique && /[\p{L}\p{N}]/u.test(s.text) && s.text.trim() === s.text) {
        expect(
          r.title,
          `${JSON.stringify(input)} consumed ${JSON.stringify(s.text)}`
        ).not.toContain(s.text);
      }
    }
  }
}

const CURATED = [
  'לקחת את האוטו למוסך מחר',
  'להחזיר מכנסיים עד יום חמישי',
  'דחוף לשלם ארנונה',
  'מועד אחרון: לשלם ארנונה עד 15/10',
  'מועד אחרון לשלם ארנונה 15/10',
  'מועד אחרון לשלם ארנונה',
  'מחר או ביום שלישי',
  'חוג כל יום שלישי בשעה 5',
  'להתקשר בשעה 17:30',
  'תזכיר לי מחר לשלם ארנונה',
  'להחליף מצבר עד יום חמישי',
  'להחזיר חולצה לזארה עד יום חמישי',
  'סופר דחוף לסדר',
  'זה חשוב! לשלם ביטוח לאומי',
  'לשלם (עד מחר)',
  'מחר בבוקר בשעה 7 !! להתקשר לרופא כל שבוע',
  'להחזיר חולצה מחר עד ה-10 בין 10:00 ל-12:00'
];

describe('property: the title never contains consumed text', () => {
  it('holds for curated and random inputs', () => {
    for (const input of CURATED) assertTitleClean(input, parseQuickAdd(input, NOW));
    const rng = mulberry32(99);
    for (let i = 0; i < 3000; i++) {
      const input = randomInput(rng);
      assertTitleClean(input, parseQuickAdd(input, NOW));
    }
  });
});

describe('property: dismissing a chip and re-parsing gives consistent fields', () => {
  it('holds for every chip of curated and random inputs, one and two at a time', () => {
    const inputs = [...CURATED];
    const rng = mulberry32(31337);
    for (let i = 0; i < 1500; i++) inputs.push(randomInput(rng));
    let dismissals = 0;
    for (const input of inputs) {
      const base = parseQuickAdd(input, NOW, TZ);
      assertConsistent(input, base, []);
      const keys = base.matches.map((m) => m.key);
      for (const key of keys) {
        const once = parseQuickAdd(input, NOW, TZ, { dismissed: [key] });
        assertConsistent(input, once, [key]);
        assertTitleClean(input, once);
        dismissals++;
        // and then a second chip that the first dismissal left standing
        const next = once.matches[0]?.key;
        if (next !== undefined) {
          const twice = parseQuickAdd(input, NOW, TZ, { dismissed: [key, next] });
          assertConsistent(input, twice, [key, next]);
        }
      }
    }
    expect(dismissals).toBeGreaterThan(1000);
  });

  it('dismissing every chip leaves the whole text as the title and no fields', () => {
    for (const input of CURATED) {
      let dismissed: string[] = [];
      let r = parseQuickAdd(input, NOW, TZ);
      for (let guard = 0; r.matches.length > 0 && guard < 20; guard++) {
        dismissed = [...dismissed, ...r.matches.map((m) => m.key)];
        r = parseQuickAdd(input, NOW, TZ, { dismissed });
      }
      // (a leading "תזכיר לי" is tidied away even then: it is not a chip)
      expect(r, input).toEqual({ title: rebuildTitle(input, []), matches: [] });
      if (!input.startsWith('תזכיר')) expect(r.title, input).toBe(collapse(input));
    }
  });
});
