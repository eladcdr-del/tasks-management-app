// @vitest-environment jsdom
// SegmentedControl's `fit` mode (Home's time tabs): content-sized options, the thumb placed on the
// measured option, and the same radiogroup behaviour as the equal-width control.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import SegmentedControl from './SegmentedControl.svelte';

const options = [
  { value: 'today', label: 'היום', count: 4 },
  { value: 'week', label: 'השבוע הקרוב', count: 4 },
  { value: 'all', label: 'הכל', count: 33 }
];

/** jsdom has no layout: give each option a box. */
function layout(widths: number[]) {
  const radios = screen.getAllByRole('radio');
  let x = 4;
  radios.forEach((el, i) => {
    const w = widths[i]!;
    const left = x;
    Object.defineProperty(el, 'offsetLeft', { configurable: true, get: () => left });
    Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => w });
    x += w;
  });
}

describe('SegmentedControl fit', () => {
  it('places the thumb on the measured option and follows the choice', async () => {
    let value = 'today';
    const { container, rerender } = render(SegmentedControl, {
      options,
      value,
      label: 'מתי',
      fit: true,
      onchange: (v: string) => (value = v)
    });
    const root = container.querySelector<HTMLElement>('[role="radiogroup"]')!;
    expect(root.classList.contains('fit')).toBe(true);
    layout([60, 120, 70]);
    await rerender({ options, value: 'week', label: 'מתי', fit: true });
    flushSync();
    expect(root.classList.contains('measured')).toBe(true);
    expect(root.style.getPropertyValue('--x')).toBe('64px');
    expect(root.style.getPropertyValue('--w')).toBe('120px');

    await fireEvent.click(screen.getByRole('radio', { name: /הכל/ }));
    flushSync();
    expect(value).toBe('all');
    expect(root.style.getPropertyValue('--x')).toBe('184px');
    expect(screen.getByRole('radio', { name: /הכל/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('without fit, options share the width equally (no measuring)', () => {
    const { container } = render(SegmentedControl, { options, value: 'today', label: 'מתי' });
    const root = container.querySelector<HTMLElement>('[role="radiogroup"]')!;
    expect(root.classList.contains('fit')).toBe(false);
    expect(root.style.getPropertyValue('--x')).toBe('');
    expect(root.style.getPropertyValue('--n')).toBe('3');
  });
});
