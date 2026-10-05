import { describe, expect, it } from 'vitest';
import { he } from './he';
import { prefixed } from './prefix';

const michal = { displayName: 'Michal', addressAs: 'f' } as const;
const dani = { displayName: 'דני', addressAs: 'm' } as const;

describe('prefixed', () => {
  it('attaches before a Hebrew word and hyphenates before anything else', () => {
    expect(prefixed('ל', 'דני')).toBe('לדני');
    expect(prefixed('מ', 'Michal')).toBe('מ-Michal');
    expect(prefixed('ל', '15/10')).toBe('ל-15/10');
    expect(prefixed('מ', '')).toBe('מ-');
  });
});

describe('names after a prefix', () => {
  it('the request snackbar, card line and history line hyphenate a Latin name', () => {
    expect(he.sheetRequest.sent('Michal')).toBe('הבקשה נשלחה ל-Michal');
    expect(he.sheetRequest.sent('דני')).toBe('הבקשה נשלחה לדני');
    expect(he.taskCard.iRequested('Michal')).toBe('ביקשת מ-Michal');
    expect(he.taskCard.iRequested('דני')).toBe('ביקשת מדני');
    expect(he.taskDetail.ev.requested(dani, 'Michal')).toBe('דני ביקש מ-Michal');
    expect(he.taskDetail.ev.requested(michal, 'דני')).toBe('Michal ביקשה מדני');
  });

  it('the snooze snackbar keeps its day labels', () => {
    expect(he.sheetSnooze.snoozed('מחר')).toBe('נדחתה למחר');
    expect(he.sheetSnooze.snoozed('15/10')).toBe('נדחתה ל-15/10');
  });
});
