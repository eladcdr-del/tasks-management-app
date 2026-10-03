import { describe, expect, it } from 'vitest';
import { form, gendered, he } from './he';

describe('gendered strings', () => {
  it('picks the form by AddressAs or by an addressee object', () => {
    expect(form('f', 'סיימה', 'סיים', 'סיים/ה')).toBe('סיימה');
    expect(form({ addressAs: 'm' }, 'סיימה', 'סיים', 'סיים/ה')).toBe('סיים');
    expect(form({ addressAs: 'n' }, 'סיימה', 'סיים', 'סיים/ה')).toBe('סיים/ה');
  });

  it('builds reusable gendered keys (t.take(me))', () => {
    const take = gendered('אני לוקחת', 'אני לוקח', 'אני לוקח/ת');
    expect(take('f')).toBe('אני לוקחת');
    expect(take({ addressAs: 'm' })).toBe('אני לוקח');
    expect(he.taskCard.take({ addressAs: 'n' })).toBe('אני לוקח/ת');
  });

  it('names the four tabs', () => {
    expect(he.shell.tabs).toEqual({
      home: 'בית',
      memory: 'זיכרון הבית',
      jar: 'הצנצנת',
      household: 'הבית שלנו'
    });
  });
});

describe('per-owner string files (src/lib/i18n/he/)', () => {
  const sources = import.meta.glob<string>('./he/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true
  });
  const files = Object.keys(sources);

  it('every file starts with its owner header', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const first = sources[file]?.split('\n', 1)[0];
      expect(first, file).toMatch(/^\/\/ owner: step \d\.\d — only that step edits this file$/);
    }
  });

  it('he aggregates exactly one namespace per file, named after it', () => {
    const namespaces = files.map((f) => f.replace(/^\.\/he\/|\.ts$/g, '')).sort();
    expect(Object.keys(he).sort()).toEqual(namespaces);
  });

  it('keeps every string from the pre-split he.ts', () => {
    expect(he.common.close).toBe('סגירה');
    expect(he.shell.fab).toBe('משימה חדשה');
    expect(he.update).toEqual({ ready: 'גרסה חדשה מוכנה', action: 'עדכון' });
    expect(he.onboarding.join.title).toBe('הצטרפות לבית');
    expect(he.onboardingNotifications.title).toBe('התראות');
    expect(he.taskDetail.title).toBe('פרטי משימה');
    expect(he.sheetQuickAdd.title).toBe('משימה חדשה');
    expect(he.sheetComplete.title).toBe('כל הכבוד, עוד משימה ירדה מהרשימה');
    expect(he.sheetRequest.title).toBe('לבקש מ…');
    expect(he.sheetSnooze.title).toBe('דחייה');
    expect(he.jar.setup.title).toBe('הצ׳ופר הבא');
    expect(he.errors.generic).toBe('משהו השתבש. נסו שוב.');
    expect(he.dev.galleryTitle).toBe('גלריית רכיבים');
  });
});
