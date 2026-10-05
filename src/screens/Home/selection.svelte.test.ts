// Home's selection store (feature "seat", B1): start / begin / toggle, "בחירת הכל" and its undo,
// letting go of what Home no longer lists, and leaving the mode.
import { describe, expect, it } from 'vitest';
import { HomeSelection } from './selection.svelte';

const ids = (s: HomeSelection) => [...s.ids].sort();

describe('HomeSelection', () => {
  it('"בחירה" starts with nothing chosen; a long press starts with that task', () => {
    const s = new HomeSelection();
    expect(s.active).toBe(false);
    s.start();
    expect(s.active).toBe(true);
    expect(s.count).toBe(0);
    s.exit();

    s.begin('a');
    expect(s.active).toBe(true);
    expect(ids(s)).toEqual(['a']);
    // Another long press while choosing adds that one too.
    s.begin('b');
    expect(ids(s)).toEqual(['a', 'b']);
  });

  it('a tap toggles while choosing, and does nothing outside the mode', () => {
    const s = new HomeSelection();
    s.toggle('a');
    expect(s.count).toBe(0);
    s.start();
    s.toggle('a');
    s.toggle('b');
    expect(ids(s)).toEqual(['a', 'b']);
    expect(s.has('a')).toBe(true);
    s.toggle('a');
    expect(ids(s)).toEqual(['b']);
    expect(s.count).toBe(1);
  });

  it('choose adds a whole list, release lets it go (keeping the rest)', () => {
    const s = new HomeSelection();
    s.choose(['x']);
    expect(s.count).toBe(0); // not choosing: nothing happens
    s.begin('attention-1');
    s.choose(['a', 'b', 'c']);
    expect(ids(s)).toEqual(['a', 'attention-1', 'b', 'c']);
    s.release(['a', 'b', 'c', 'missing']);
    expect(ids(s)).toEqual(['attention-1']);
  });

  it('keepOnly drops what Home no longer lists (another tab or chip, done, deleted)', () => {
    const s = new HomeSelection();
    s.start();
    s.choose(['a', 'b', 'c']);
    const before = s.ids;
    s.keepOnly(['a', 'b', 'c', 'd']);
    expect(s.ids).toBe(before); // nothing changed: the same set (no needless updates)
    s.keepOnly(['b', 'd']);
    expect(ids(s)).toEqual(['b']);
  });

  it('exit leaves the mode and forgets the choice', () => {
    const s = new HomeSelection();
    s.begin('a');
    s.exit();
    expect(s.active).toBe(false);
    expect(s.count).toBe(0);
    s.exit(); // twice is fine
    expect(s.active).toBe(false);
  });
});
