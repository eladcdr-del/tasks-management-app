import { describe, expect, it } from 'vitest';
import { textDir } from './textDir';

describe('textDir', () => {
  it.each([
    ['IKEA להחזיר את המדף', 'rtl'],
    ['להחזיר את המדף ל-IKEA', 'rtl'],
    ['לבטל את המנוי ל־Netflix', 'rtl'],
    ['Netflix', 'auto'],
    ['Omer', 'auto'],
    ['050-1234567', 'auto'],
    ['17:30', 'auto'],
    ['', 'auto'],
    ['   ', 'auto'],
    ['שָׁלוֹם', 'rtl'], // niqqud
    ['ך', 'rtl'], // final letter
    ['־', 'rtl'], // maqaf, still the Hebrew block
    ['مرحبا', 'auto'], // Arabic is not Hebrew: auto resolves it RTL on its own
    ['🙂 דני', 'rtl']
  ])('%j → %s', (input, expected) => {
    expect(textDir(input)).toBe(expected);
  });

  it('treats null and undefined as empty', () => {
    expect(textDir(null)).toBe('auto');
    expect(textDir(undefined)).toBe('auto');
  });
});
