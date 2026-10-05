// @vitest-environment jsdom
import '../test/jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { TaskDraft } from '$lib/domain/types';
import { clock } from '$lib/state/clock.svelte';
import { ui } from '$lib/state/ui.svelte';
import { homeView } from '../screens/Home/homeView.svelte';

const store = vi.hoisted(() => ({
  createMany: vi.fn((drafts: readonly unknown[]) => drafts.map((_, i) => `new-${i + 1}`)),
  remove: vi.fn()
}));
vi.mock('$lib/state/tasks.svelte', () => ({ tasks: store }));

import QuickAddList from './QuickAddList.svelte';

// Sunday 4 Oct 2026, 09:00 in Jerusalem: "מחר" = Mon 5 Oct.
const NOW = Date.parse('2026-10-04T09:00:00+03:00');

const box = () => screen.getByLabelText('רשימת המשימות') as HTMLTextAreaElement;
const rows = () =>
  within(screen.getByRole('list', { name: 'המשימות שיתווספו' }))
    .queryAllByRole('listitem')
    .filter((li) => li.hasAttribute('data-row'));
const addButton = () => document.querySelector<HTMLButtonElement>('[data-list-add]')!;

function setup(props: { text?: string; pasted?: boolean } = {}) {
  const onBack = vi.fn();
  const onDone = vi.fn();
  const result = render(QuickAddList, { props: { text: '', ...props, onBack, onDone } });
  return { ...result, onBack, onDone };
}

async function type(text: string) {
  await fireEvent.input(box(), { target: { value: text } });
}

beforeEach(() => {
  vi.clearAllMocks();
  clock.nowMs = NOW;
  ui.queue = [];
  homeView.addedBatch = [];
});

describe('QuickAddList', () => {
  it('starts empty: the hint shows and the add button is off', () => {
    setup();
    expect(screen.getByText('משימה בכל שורה. אפשר להדביק רשימה מוואטסאפ או מהפתקים')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'המשימות שיתווספו' })).toBeNull();
    expect(addButton()).toBeDisabled();
    expect(addButton()).toHaveTextContent('הוספת משימות');
  });

  it('previews one row per line with its cleaned title and chips, and counts them', async () => {
    setup();
    await type('משימות לבית:\n1. להשקות עציצים\n2. לתקן את הברז מחר דחוף\n\n- להשקות עציצים');
    const list = rows();
    expect(list.map((li) => li.querySelector('.row-title')?.textContent)).toEqual([
      'להשקות עציצים',
      'לתקן את הברז'
    ]);
    const chips = within(list[1]!).getAllByRole('listitem');
    expect(chips.map((c) => c.getAttribute('data-key')?.split(':')[0])).toEqual(
      expect.arrayContaining(['date', 'priority'])
    );
    expect(within(list[1]!).getByText(/מחר · יום ב׳ 5\/10/)).toBeVisible();
    expect(addButton()).toBeEnabled();
    expect(addButton()).toHaveTextContent('הוספת 2 משימות');
  });

  it('says so when the list came from a paste', () => {
    setup({ text: 'לקנות חלב\nלתקן ברז', pasted: true });
    expect(screen.getByText('הדבקת רשימה, אז כל שורה תהיה משימה נפרדת')).toBeVisible();
  });

  it('× drops the line (and its duplicates) from the box and moves focus to the next row', async () => {
    setup({ text: '- לקנות חלב\n- לתקן ברז\n- לקנות חלב\n- להשקות עציצים' });
    await fireEvent.click(screen.getByRole('button', { name: 'הסרה מהרשימה: לקנות חלב' }));
    await tick();
    await tick();
    expect(box().value).toBe('- לתקן ברז\n- להשקות עציצים');
    expect(rows()).toHaveLength(2);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'הסרה מהרשימה: לתקן ברז' })
    );
    expect(addButton()).toHaveTextContent('הוספת 2 משימות');
  });

  it('adds them all unowned, says how many with an undo, and closes', async () => {
    const { onDone } = setup({ text: 'להשקות עציצים\nלתקן את הברז מחר\nלשלם ארנונה' });
    await fireEvent.click(addButton());
    expect(store.createMany).toHaveBeenCalledTimes(1);
    const drafts = store.createMany.mock.calls[0]![0] as TaskDraft[];
    expect(drafts.map((d) => d.title)).toEqual(['להשקות עציצים', 'לתקן את הברז', 'לשלם ארנונה']);
    expect(drafts.every((d) => d.ownerId === null)).toBe(true);
    expect(drafts[1]).toMatchObject({ scheduledFor: '2026-10-05' });
    expect(homeView.addedBatch).toEqual(['new-1', 'new-2', 'new-3']);
    expect(ui.current).toMatchObject({ message: 'נוספו 3 משימות', action: 'ביטול' });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(box().value).toBe('');

    ui.current!.onAction!();
    expect(store.remove.mock.calls.map((c) => c[0])).toEqual(['new-1', 'new-2', 'new-3']);
  });

  it('one task reads in the singular', async () => {
    setup({ text: '• להשקות עציצים' });
    expect(addButton()).toHaveTextContent('הוספת משימה אחת');
    await fireEvent.click(addButton());
    expect(ui.current?.message).toBe('נוספה משימה אחת');
  });

  it('past 50, adds the first 50 and keeps the rest in the box for another round', async () => {
    const lines = Array.from({ length: 52 }, (_, i) => `משימה מספר ${i + 1}`);
    const { onDone } = setup({ text: lines.join('\n') });
    expect(
      screen.getByText(/אפשר להוסיף עד 50 משימות בבת אחת. עוד 2 משימות יחכו כאן/)
    ).toBeVisible();
    expect(addButton()).toHaveTextContent('הוספת 50 משימות');
    await fireEvent.click(addButton());
    expect((store.createMany.mock.calls[0]![0] as TaskDraft[]).length).toBe(50);
    expect(onDone).not.toHaveBeenCalled();
    expect(box().value).toBe('משימה מספר 51\nמשימה מספר 52');
    expect(screen.getByRole('status')).toHaveTextContent('נוספו 50 משימות. נשארו עוד 2');
    expect(addButton()).toHaveTextContent('הוספת 2 משימות');

    await fireEvent.click(addButton());
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(homeView.addedBatch).toHaveLength(52);
  });

  it('nothing is added (and the sheet stays) when every create fails', async () => {
    store.createMany.mockReturnValueOnce([]);
    const { onDone } = setup({ text: 'לקנות חלב\nלתקן ברז' });
    await fireEvent.click(addButton());
    expect(onDone).not.toHaveBeenCalled();
    expect(ui.current).toBeNull();
    expect(box().value).toBe('לקנות חלב\nלתקן ברז');
  });

  it('"חזרה למשימה אחת" goes back', async () => {
    const { onBack } = setup();
    await fireEvent.click(screen.getByRole('button', { name: 'חזרה למשימה אחת' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
