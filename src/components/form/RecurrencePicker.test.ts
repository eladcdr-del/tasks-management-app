// @vitest-environment jsdom
import '../../test/jsdom';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import type { RecurrenceRule } from '$lib/domain/recurrence';
import RecurrencePicker from './RecurrencePicker.svelte';

/** Monday 2026-10-05. */
const MONDAY = '2026-10-05';

function setup(value: RecurrenceRule | null, date: string | null = null) {
  const onChange = vi.fn();
  const view = render(RecurrencePicker, { props: { value, date, onChange } });
  return { onChange, ...view };
}

const pressed = (name: string) =>
  screen.getByRole('button', { name, exact: true }).getAttribute('aria-pressed');

describe('RecurrencePicker', () => {
  it('offers the presets and "אחר", with the current one selected', () => {
    setup(null);
    for (const name of ['לא חוזרת', 'כל יום', 'כל שבוע', 'כל חודש', 'כל שנה', 'אחר']) {
      expect(screen.getByRole('button', { name, exact: true })).toBeInTheDocument();
    }
    expect(pressed('לא חוזרת')).toBe('true');
    expect(pressed('כל יום')).toBe('false');
    expect(screen.queryByTestId('repeat-days')).toBeNull();
    expect(screen.queryByTestId('repeat-custom')).toBeNull();
  });

  it('a one-tap preset is settled; "כל שבוע" leads on to its days', async () => {
    const { onChange } = setup(null);
    await fireEvent.click(screen.getByRole('button', { name: 'כל יום', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith({ freq: 'daily' }, true);
    await fireEvent.click(screen.getByRole('button', { name: 'לא חוזרת', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith(null, true);
    await fireEvent.click(screen.getByRole('button', { name: 'כל שבוע', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith({ freq: 'weekly' }, false);
  });

  it('a weekly rule shows seven day toggles; the date’s weekday is on until days are listed', async () => {
    const { onChange } = setup({ freq: 'weekly' }, MONDAY);
    const days = within(screen.getByTestId('repeat-days')).getAllByRole('button');
    expect(days.map((d) => d.textContent?.trim())).toEqual(['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']);
    expect(days.map((d) => d.getAttribute('aria-label'))).toEqual([
      'יום ראשון',
      'יום שני',
      'יום שלישי',
      'יום רביעי',
      'יום חמישי',
      'יום שישי',
      'שבת'
    ]);
    expect(days.map((d) => d.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
      'false',
      'false'
    ]);
    expect(screen.getByRole('group', { name: 'באילו ימים?' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'יום חמישי' }));
    expect(onChange).toHaveBeenLastCalledWith({ freq: 'weekly', weekdays: [1, 4] }, false);
  });

  it('listed days show as on, and turning one off keeps the rest', async () => {
    const { onChange } = setup({ freq: 'weekly', weekdays: [0, 3] }, MONDAY);
    expect(pressed('כל שבוע')).toBe('true');
    expect(screen.getByRole('button', { name: 'יום ראשון' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'יום שני' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await fireEvent.click(screen.getByRole('button', { name: 'יום ראשון' }));
    expect(onChange).toHaveBeenLastCalledWith({ freq: 'weekly', weekdays: [3] }, false);
  });

  it('"אחר" starts every 2 weeks and shows "כל [N] [unit]"', async () => {
    const { onChange, rerender } = setup(null);
    await fireEvent.click(screen.getByRole('button', { name: 'אחר', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith({ freq: 'weekly', interval: 2 }, false);
    await rerender({ value: { freq: 'weekly', interval: 2 }, date: null, onChange });
    const custom = screen.getByTestId('repeat-custom');
    expect(within(custom).getByRole('group', { name: 'כל כמה' })).toHaveTextContent('2');
    const units = within(custom).getAllByRole('radio');
    expect(units.map((u) => u.textContent?.trim())).toEqual(['ימים', 'שבועות', 'חודשים', 'שנים']);
    expect(within(custom).getByRole('radio', { name: 'שבועות' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(pressed('אחר')).toBe('true');
    expect(pressed('כל שבוע')).toBe('false');
    // the days stay available for every N weeks
    expect(screen.getByTestId('repeat-days')).toBeInTheDocument();
  });

  it('the stepper and the unit change the rule', async () => {
    const { onChange } = setup({ freq: 'daily', interval: 3 });
    expect(pressed('אחר')).toBe('true');
    const custom = screen.getByTestId('repeat-custom');
    await fireEvent.click(within(custom).getByRole('button', { name: 'הוספה' }));
    expect(onChange).toHaveBeenLastCalledWith({ freq: 'daily', interval: 4 }, false);
    await fireEvent.click(within(custom).getByRole('radio', { name: 'חודשים' }));
    expect(onChange).toHaveBeenLastCalledWith({ freq: 'monthly', interval: 3 }, false);
    expect(screen.queryByTestId('repeat-days')).toBeNull();
  });

  it('units read in the singular at 1 ("כל [1] [שבוע]"), and the row stays while editing', async () => {
    const { onChange, rerender } = setup({ freq: 'weekly', interval: 2 });
    await fireEvent.click(
      within(screen.getByTestId('repeat-custom')).getByRole('button', { name: 'הפחתה' })
    );
    expect(onChange).toHaveBeenLastCalledWith({ freq: 'weekly' }, false);
    await fireEvent.click(screen.getByRole('button', { name: 'אחר', exact: true }));
    await rerender({ value: { freq: 'weekly' }, date: null, onChange });
    const units = within(screen.getByTestId('repeat-custom')).getAllByRole('radio');
    expect(units.map((u) => u.textContent?.trim())).toEqual(['יום', 'שבוע', 'חודש', 'שנה']);
  });
});
