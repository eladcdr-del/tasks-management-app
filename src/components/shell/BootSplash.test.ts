// @vitest-environment jsdom
// The boot splash is never silent for long: an error shows at once, a slow start (a connection
// that hangs instead of failing) gets a calm hint and a retry after SLOW_BOOT_MS.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { he } from '$lib/i18n/he';
import BootSplash, { SLOW_BOOT_MS } from './BootSplash.svelte';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BootSplash', () => {
  it('shows only the mark at first, then a hint and a retry after SLOW_BOOT_MS', async () => {
    const onRetry = vi.fn();
    const { container } = render(BootSplash, { phase: 'booting', onRetry });
    expect(container.querySelector('[data-phase="booting"]')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    vi.advanceTimersByTime(SLOW_BOOT_MS - 1);
    flushSync();
    expect(screen.queryByRole('status')).toBeNull();

    vi.advanceTimersByTime(1);
    flushSync();
    expect(screen.getByRole('status')).toHaveTextContent(he.shell.slowStart);
    await fireEvent.click(screen.getByRole('button', { name: he.common.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a failed boot shows the error and the retry at once', () => {
    render(BootSplash, { phase: 'booting', failed: true, onRetry: () => {} });
    expect(screen.getByRole('alert')).toHaveTextContent(he.errors.generic);
    expect(screen.getByRole('button', { name: he.common.retry })).toBeInTheDocument();
  });
});
