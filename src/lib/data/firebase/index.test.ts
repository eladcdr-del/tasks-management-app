// @vitest-environment jsdom
// The adapter's firebaseConfigLooksComplete and select.ts's configLooksComplete decide the same
// question (is firebase-config.ts filled in?) in two places, because select.ts must not import this
// folder statically. One table, both functions, identical answers.
import { describe, expect, it } from 'vitest';
import { firebaseConfigLooksComplete } from './index';
import { configLooksComplete, EMULATOR_CONFIG } from '../select';
import { firebaseConfig } from '../../../../firebase-config';

const COMPLETE = {
  apiKey: 'AIzaSyX',
  authDomain: 'homecare-1.firebaseapp.com',
  projectId: 'homecare-1',
  storageBucket: 'homecare-1.firebasestorage.app',
  messagingSenderId: '123',
  appId: '1:123:web:abc'
};
const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId'] as const;

const without = (k: string) =>
  Object.fromEntries(Object.entries(COMPLETE).filter(([x]) => x !== k));

const TABLE: [label: string, cfg: unknown, expected: boolean][] = [
  ['complete', COMPLETE, true],
  ['complete without storageBucket', without('storageBucket'), true],
  ['empty storageBucket is fine', { ...COMPLETE, storageBucket: '' }, true],
  ['extra keys are ignored', { ...COMPLETE, measurementId: 'G-1', extra: 42 }, true],
  ['values with surrounding spaces', { ...COMPLETE, apiKey: '  AIza  ' }, true],
  ['the emulator config', EMULATOR_CONFIG, true],
  ...REQUIRED.flatMap((k): [string, unknown, boolean][] => [
    [`${k} missing`, without(k), false],
    [`${k} empty`, { ...COMPLETE, [k]: '' }, false],
    [`${k} only spaces`, { ...COMPLETE, [k]: '   ' }, false],
    [`${k} only a tab and newline`, { ...COMPLETE, [k]: '\t\n' }, false],
    [`${k} null`, { ...COMPLETE, [k]: null }, false],
    [`${k} undefined`, { ...COMPLETE, [k]: undefined }, false],
    [`${k} a number`, { ...COMPLETE, [k]: 123 }, false],
    [`${k} a boolean`, { ...COMPLETE, [k]: true }, false],
    [`${k} an object`, { ...COMPLETE, [k]: { value: 'x' } }, false],
    [`${k} a String object`, { ...COMPLETE, [k]: new String('x') }, false]
  ]),
  ['all empty (the shipped template)', Object.fromEntries(REQUIRED.map((k) => [k, ''])), false],
  ['an empty object', {}, false],
  ['null', null, false],
  ['undefined', undefined, false],
  ['a string', 'apiKey', false],
  ['a number', 7, false],
  ['true', true, false],
  ['an array', [], false],
  ['an array with the keys as props', Object.assign([], COMPLETE), true],
  ['a function', () => COMPLETE, false]
];

describe('firebaseConfigLooksComplete ≡ select.configLooksComplete', () => {
  it.each(TABLE)('%s', (_label, cfg, expected) => {
    expect(configLooksComplete(cfg)).toBe(expected);
    expect(firebaseConfigLooksComplete(cfg)).toBe(expected);
  });

  it('agrees on the repository’s own firebase-config.ts', () => {
    expect(firebaseConfigLooksComplete(firebaseConfig)).toBe(configLooksComplete(firebaseConfig));
  });
});
