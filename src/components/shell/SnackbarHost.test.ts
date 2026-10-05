// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom has no matchMedia; svelte/motion builds a MediaQuery when it is first imported.
vi.hoisted(() => {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false
    }) as MediaQueryList;
});

import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { ui } from '$lib/state/ui.svelte';
import SnackbarHost from './SnackbarHost.svelte';

// jsdom has no Web Animations. Svelte's transitions need element.animate(); this stand-in never
// finishes, so an outro stays in flight for as long as the test needs (as on a real phone, where
// the finger lifts while the snackbar is still fading out).
beforeAll(() => {
  Element.prototype.animate ??= function animate() {
    return {
      onfinish: null,
      currentTime: 0,
      playState: 'running',
      effect: null,
      cancel() {}
    } as unknown as Animation;
  };
});

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
});
