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
  enablePush: vi.fn(),
  pushStatus: vi.fn(),
  onPushRegistrationChange: vi.fn((_cb: () => void) => () => {})
}));
vi.mock('$lib/platform/push', () => push);
vi.mock('$lib/state/household.svelte', () => ({
  household: {
    me: { notify: { requests: true, reminders: true, partnerDone: true, weekly: true } },
    updateMember: vi.fn()
  }
}));

import NotificationSettings from './NotificationSettings.svelte';

const status = () => document.querySelector('[data-push-status]')?.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  ui.queue = [];
});

describe('NotificationSettings', () => {
  it('does not call notifications active until this device is registered, and offers a retry', async () => {
    push.pushStatus.mockReturnValue('unregistered');
    push.enablePush.mockImplementation(async () => {
      push.pushStatus.mockReturnValue('granted');
      return 'enabled';
    });
    render(NotificationSettings);
    expect(status()).toBe('ההתראות עוד לא מגיעות למכשיר הזה');

    await fireEvent.click(screen.getByRole('button', { name: 'הפעלה מחדש' }));
    await vi.waitFor(() => expect(status()).toBe('ההתראות פעילות במכשיר הזה'));
    expect(push.enablePush).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'הפעלה מחדש' })).toBeNull();
    expect(ui.current?.message).toBe('ההתראות הופעלו');
  });

  it('says so when the retry fails too', async () => {
    push.pushStatus.mockReturnValue('unregistered');
    push.enablePush.mockResolvedValue('error');
    render(NotificationSettings);
    await fireEvent.click(screen.getByRole('button', { name: 'הפעלה מחדש' }));
    await vi.waitFor(() => expect(ui.current?.message).toMatch(/^לא הצלחנו להפעיל התראות/));
    expect(status()).toBe('ההתראות עוד לא מגיעות למכשיר הזה');
  });

  it('re-reads the status when this device registers in the background', () => {
    push.pushStatus.mockReturnValue('unregistered');
    render(NotificationSettings);
    const changed = push.onPushRegistrationChange.mock.calls[0]![0];
    push.pushStatus.mockReturnValue('granted');
    changed();
    flushSync();
    expect(status()).toBe('ההתראות פעילות במכשיר הזה');
  });

  it('describes the reminder and completion switches as the notifier sends them', () => {
    push.pushStatus.mockReturnValue('granted');
    render(NotificationSettings);
    expect(screen.getByText('בבוקר של יום היעד, וערב לפני מועד אחרון')).toBeInTheDocument();
    expect(screen.getByText('כשמישהו אחר בבית מסיים משימה')).toBeInTheDocument();
  });
});
