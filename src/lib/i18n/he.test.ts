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
    expect(he.task.take({ addressAs: 'n' })).toBe('אני לוקח/ת');
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
