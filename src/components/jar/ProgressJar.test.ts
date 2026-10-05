// @vitest-environment jsdom
import '../../test/jsdom';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { Marble } from './marbles';
import ProgressJar from './ProgressJar.svelte';

const m = (over: Partial<Marble> = {}): Marble => ({
  uid: 'michal',
  color: 'terracotta',
  help: false,
  bonus: false,
  ...over
});
const LABEL = 'צנצנת עם 3 גולות מתוך 10';

describe('ProgressJar', () => {
  it('a marble per completion in its member colour, outlines for the rest', () => {
    render(ProgressJar, {
      props: {
        marbles: [m(), m({ uid: 'dani', color: 'slate', help: true }), m({ bonus: true })],
        empty: 7,
        label: LABEL
      }
    });
    const svg = screen.getByRole('img', { name: LABEL });
    expect(svg).toHaveAttribute('data-count', '3');
    const fills = [...svg.querySelectorAll('circle.marble')].map((c) => c.getAttribute('fill'));
    expect(fills).toEqual([
      'var(--member-terracotta-base)',
      'var(--member-slate-base)',
      'var(--member-terracotta-base)'
    ]);
    expect(svg.querySelectorAll('circle.slot')).toHaveLength(7);
    expect(svg.querySelectorAll('[data-help]')).toHaveLength(1); // the heart
    expect(svg.querySelectorAll('.halo')).toHaveLength(1); // the bonus
  });

  it('the first render is still unless told what is new since the last visit', () => {
    render(ProgressJar, { props: { marbles: [m(), m()], empty: 3, label: LABEL } });
    expect(document.querySelectorAll('.drop')).toHaveLength(0);
  });

  it('marbles past `seen` drop in, the newest eight at most', () => {
    const marbles = Array.from({ length: 12 }, () => m());
    render(ProgressJar, { props: { marbles, empty: 0, seen: 1, label: LABEL } });
    expect(document.querySelectorAll('.drop')).toHaveLength(8);
  });

  it('a new marble drops in live; the others stay put', async () => {
    const view = render(ProgressJar, { props: { marbles: [m(), m()], empty: 3, label: LABEL } });
    await view.rerender({ marbles: [m(), m(), m({ uid: 'dani', color: 'slate' })], empty: 2 });
    const drops = document.querySelectorAll('.drop');
    expect(drops).toHaveLength(1);
    expect(drops[0]!.querySelector('circle.marble')).toHaveAttribute(
      'fill',
      'var(--member-slate-base)'
    );
  });

  it('full: the lid rests ajar over the glow', () => {
    render(ProgressJar, { props: { marbles: [m()], empty: 0, full: true, label: LABEL } });
    expect(screen.getByRole('img', { name: LABEL })).toHaveAttribute('data-full');
  });
});
