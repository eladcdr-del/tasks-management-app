// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PickerChip from './PickerChip.svelte';

// Launch audit MOM-8: the separator lost its spaces ("מי·בחירה"), and the button's name read as
// one glued word ("מיבחירה") because the dot is hidden from screen readers.
describe('PickerChip', () => {
  it('reads "מתי · בחירה" while empty, and its name keeps a space', () => {
    const { container } = render(PickerChip, { props: { label: 'מתי' } });
    expect(container.querySelector('.text')?.textContent).toBe('מתי · בחירה');
    expect(screen.getByRole('button', { name: 'מתי בחירה' })).toBeInTheDocument();
  });

  it('reads "מי · דני" with a value', () => {
    const { container } = render(PickerChip, {
      props: { label: 'מי', value: 'דני', userText: true, onclear: () => {} }
    });
    expect(container.querySelector('.text')?.textContent).toBe('מי · דני');
    expect(screen.getByRole('button', { name: 'מי דני' })).toBeInTheDocument();
  });
});
