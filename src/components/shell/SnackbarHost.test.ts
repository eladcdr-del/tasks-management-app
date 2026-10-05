// @vitest-environment jsdom
import '../../test/jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { ui } from '$lib/state/ui.svelte';
import SnackbarHost from './SnackbarHost.svelte';

// The outro never finishes in jsdom (src/test/jsdom.ts): the dismissed snackbar stays mounted and
// keeps receiving events, as it does on a phone while it fades out.

afterEach(() => {
  ui.dismiss();
  flushSync();
});

describe('SnackbarHost', () => {
  it('tapping the action runs it once, and the pointer events that follow throw nothing', () => {
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    const onAction = vi.fn();
    try {
      render(SnackbarHost);
      ui.show('בוצע', { action: 'ביטול', onAction });
      flushSync();
      const action = screen.getByRole('button', { name: 'ביטול' });
      const bar = action.closest('.snackbar')!;

      // A finger: down on the action (holds the timer), the tap, then up and leave.
      fireEvent.pointerDown(bar, { pointerType: 'touch' });
      fireEvent.pointerEnter(bar, { pointerType: 'mouse' });
      fireEvent.click(action);
      flushSync();
      expect(ui.current).toBeNull();
      fireEvent.pointerUp(bar, { pointerType: 'touch' });
      fireEvent.pointerLeave(bar, { pointerType: 'mouse' });
      fireEvent.click(action); // a second tap while it fades out does nothing
      fireEvent.focusOut(bar);
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('a snackbar still fading out when its timer fires removes only itself, and throws nothing', () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      render(SnackbarHost);
      ui.show('נמחקה', { action: 'ביטול', onAction: () => {}, duration: 5000 });
      flushSync();
      // Something else ends it first (an undo window committing), so the queue is empty while
      // this snackbar is still on screen, fading out.
      ui.dismiss();
      flushSync();
      expect(ui.current).toBeNull();
      vi.advanceTimersByTime(3000);
      const next = ui.show('הבא', { duration: 5000 });
      flushSync();
      // The fading snackbar's own 5 s run out now; the next message still has 2.5 s to go.
      vi.advanceTimersByTime(2500);
      flushSync();
      expect(errors).toEqual([]);
      expect(ui.current?.id).toBe(next);
    } finally {
      window.removeEventListener('error', onError);
      vi.useRealTimers();
    }
  });
});
