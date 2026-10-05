// @vitest-environment jsdom
import '../test/jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { clock } from '$lib/state/clock.svelte';

const store = vi.hoisted(() => ({
  create: vi.fn(() => 'new-1'),
  createMany: vi.fn((drafts: readonly unknown[]) => drafts.map((_, i) => `new-${i + 1}`)),
  remove: vi.fn()
}));
vi.mock('$lib/state/tasks.svelte', () => ({ tasks: store }));

import QuickAddSheet from './QuickAddSheet.svelte';

const NOW = Date.parse('2026-10-04T09:00:00+03:00');

const input = () => screen.getByLabelText('מה צריך לעשות?') as HTMLInputElement;
const listBox = () => screen.queryByLabelText('רשימת המשימות') as HTMLTextAreaElement | null;
const single = () => screen.getByTestId('quick-add');

function paste(text: string) {
  return fireEvent.paste(input(), { clipboardData: { getData: () => text } });
}

beforeEach(() => {
  vi.clearAllMocks();
  clock.nowMs = NOW;
});

describe('QuickAddSheet: the way into the list mode', () => {
  it('"הוספת כמה משימות בבת אחת" opens the list and carries what was typed', async () => {
    render(QuickAddSheet, { props: { onClose: vi.fn() } });
    expect(listBox()).toBeNull();
    await fireEvent.input(input(), { target: { value: 'לקנות חלב' } });
    await fireEvent.click(screen.getByRole('button', { name: 'הוספת כמה משימות בבת אחת' }));
    expect(single()).not.toBeVisible();
    expect(listBox()!.value).toBe('לקנות חלב');
    expect(screen.getByRole('heading', { name: 'כמה משימות בבת אחת' })).toBeVisible();
    // The plain hint, not the paste note.
    expect(screen.getByText('משימה בכל שורה. אפשר להדביק רשימה מוואטסאפ או מהפתקים')).toBeVisible();

    await fireEvent.click(screen.getByRole('button', { name: 'חזרה למשימה אחת' }));
    await tick();
    expect(listBox()).toBeNull();
    expect(single()).toBeVisible();
    expect(input().value).toBe('');
    expect(document.activeElement).toBe(input());

    // The list is kept while switching back and forth.
    await fireEvent.click(screen.getByRole('button', { name: 'הוספת כמה משימות בבת אחת' }));
    expect(listBox()!.value).toBe('לקנות חלב');
  });

  it('pasting several lines into the field switches to the list instead of one squashed title', async () => {
    render(QuickAddSheet, { props: { onClose: vi.fn() } });
    const event = await paste('1. לקנות חלב\n2. לתקן ברז\n3. לשלם ארנונה');
    expect(event).toBe(false); // the paste was taken over
    expect(input().value).toBe('');
    expect(listBox()!.value).toBe('1. לקנות חלב\n2. לתקן ברז\n3. לשלם ארנונה');
    expect(screen.getByText('הדבקת רשימה, אז כל שורה תהיה משימה נפרדת')).toBeVisible();
    expect(document.querySelector('[data-list-add]')).toHaveTextContent('הוספת 3 משימות');
  });

  it('keeps what was typed around the caret as part of the list', async () => {
    render(QuickAddSheet, { props: { onClose: vi.fn() } });
    await fireEvent.input(input(), { target: { value: 'לקנות ' } });
    input().setSelectionRange(6, 6);
    await paste('חלב\nלחם');
    expect(listBox()!.value).toBe('לקנות חלב\nלחם');
  });

  it('a one-line paste stays in the field', async () => {
    render(QuickAddSheet, { props: { onClose: vi.fn() } });
    const event = await paste('לקנות חלב\n');
    expect(event).toBe(true); // not prevented: the browser pastes it as usual
    expect(listBox()).toBeNull();
  });

  it('a keyboard suggestion that inserts several lines switches too', async () => {
    render(QuickAddSheet, { props: { onClose: vi.fn() } });
    const event = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'לקנות חלב\nלתקן ברז',
      cancelable: true,
      bubbles: true
    });
    input().dispatchEvent(event);
    await tick();
    expect(event.defaultPrevented).toBe(true);
    expect(listBox()!.value).toBe('לקנות חלב\nלתקן ברז');
  });

  it('adding the list closes the sheet', async () => {
    const onClose = vi.fn();
    render(QuickAddSheet, { props: { onClose } });
    await paste('לקנות חלב\nלתקן ברז');
    await fireEvent.click(document.querySelector('[data-list-add]')!);
    expect(store.createMany).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
