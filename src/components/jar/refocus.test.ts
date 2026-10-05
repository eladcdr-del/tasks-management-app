// @vitest-environment jsdom
import '../../test/jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { refocusWhenLost } from './refocus';

const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('refocusWhenLost', () => {
  it('moves focus to the target once the focused control has left the page', async () => {
    document.body.innerHTML = '<button id="gone">⋮</button><button id="next">⋮</button>';
    const gone = document.getElementById('gone')!;
    const next = document.getElementById('next')!;
    gone.focus();
    refocusWhenLost(() => next);
    await frames(1);
    expect(document.activeElement).toBe(gone); // still there: left alone
    gone.remove();
    await frames();
    expect(document.activeElement).toBe(next);
  });

  it('leaves focus alone when it moved somewhere real', async () => {
    document.body.innerHTML = '<button id="a">a</button><button id="b">b</button>';
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    b.focus();
    refocusWhenLost(() => a, 50);
    await frames(4);
    expect(document.activeElement).toBe(b);
  });

  it('tolerates a missing target, and gives up after the time allowed', async () => {
    document.body.innerHTML = '<button id="a">a</button>';
    const a = document.getElementById('a')!;
    refocusWhenLost(() => null, 30);
    await frames(4);
    expect(document.activeElement).toBe(document.body);
    await new Promise((r) => setTimeout(r, 60));
    refocusWhenLost(() => a, 0);
    await frames(2);
    expect(document.activeElement).toBe(a); // checked at least once
  });
});
