// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { ui } from '$lib/state/ui.svelte';

// Svelte's motion helpers (pulled in through '$components/ui') read prefers-reduced-motion on import.
vi.hoisted(() => {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    }) as unknown as MediaQueryList;
});

const push = vi.hoisted(() => ({
  appPushPrompt: vi.fn((): 'ask' | 'blocked' | null => null),
  dismissAppPushPrompt: vi.fn(),
  enablePush: vi.fn(),
  onPushRegistrationChange: vi.fn((_cb: () => void) => () => {})
}));
vi.mock('$lib/platform/push', () => push);

import AppPushBanner from './AppPushBanner.svelte';

const banner = () => document.querySelector('[data-app-push]');
const allow = () => screen.queryByRole('button', { name: 'אישור התראות' });

beforeEach(() => {
  vi.clearAllMocks();
  ui.queue = [];
  push.appPushPrompt.mockReturnValue(null);
});

describe('AppPushBanner (Home)', () => {
  it('says nothing when the installed app needs nothing', () => {
    render(AppPushBanner);
    expect(banner()).toBeNull();
  });

  it('asks to allow notifications here once; allowing (from the tap) makes it go away', async () => {
    push.appPushPrompt.mockReturnValue('ask');
    push.enablePush.mockImplementation(async () => {
      push.appPushPrompt.mockReturnValue(null);
      return 'enabled';
    });
    render(AppPushBanner);
    expect(banner()).toHaveTextContent(
      'כדי שההתראות יגיעו גם לאפליקציה המותקנת, צריך לאשר אותן כאן פעם אחת'
    );
    await fireEvent.click(allow()!);
    expect(push.enablePush).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(banner()).toBeNull());
    expect(ui.current?.message).toBe('ההתראות הופעלו');
  });

  it('refused in Android’s dialog: shows the way back through the app info', async () => {
    push.appPushPrompt.mockReturnValue('ask');
    push.enablePush.mockResolvedValue('denied');
    render(AppPushBanner);
    await fireEvent.click(allow()!);
    await vi.waitFor(() => expect(banner()).toHaveAttribute('data-app-push', 'blocked'));
    expect(banner()).toHaveTextContent('ההתראות חסומות באפליקציה המותקנת');
    expect([...banner()!.querySelectorAll('bdi')].map((b) => b.textContent)).toEqual([
      'לחיצה ארוכה על הסמל של HomeCare',
      '"פרטי האפליקציה"',
      '"התראות"',
      'לאפשר'
    ]);
    expect(allow()).toBeNull();
  });

  it('already blocked: the steps, no button', () => {
    push.appPushPrompt.mockReturnValue('blocked');
    render(AppPushBanner);
    expect(banner()).toHaveTextContent('לחיצה ארוכה על הסמל של HomeCare');
    expect(allow()).toBeNull();
  });

  it('"לא עכשיו" hides it and remembers that for a few days', async () => {
    push.appPushPrompt.mockReturnValue('ask');
    render(AppPushBanner);
    await fireEvent.click(screen.getByRole('button', { name: 'לא עכשיו' }));
    expect(push.dismissAppPushPrompt).toHaveBeenCalledTimes(1);
    expect(banner()).toBeNull();
  });

  it('goes when this device registers in the background (allowed in the system settings)', () => {
    push.appPushPrompt.mockReturnValue('ask');
    render(AppPushBanner);
    const changed = push.onPushRegistrationChange.mock.calls[0]![0];
    push.appPushPrompt.mockReturnValue(null);
    changed();
    flushSync();
    expect(banner()).toBeNull();
  });

  it('a failed registration after allowing says so, and keeps the note', async () => {
    push.appPushPrompt.mockReturnValue('ask');
    push.enablePush.mockResolvedValue('error');
    render(AppPushBanner);
    await fireEvent.click(allow()!);
    await vi.waitFor(() => expect(ui.current?.message).toMatch(/^לא הצלחנו להפעיל התראות/));
    expect(banner()).not.toBeNull();
  });
});
