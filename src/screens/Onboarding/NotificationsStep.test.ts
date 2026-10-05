// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

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

const push = vi.hoisted(() => ({ enablePush: vi.fn(), pushStatus: vi.fn() }));
const router = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('$lib/platform/push', () => push);
vi.mock('$lib/router/router.svelte', () => ({ router }));

import NotificationsStep from './NotificationsStep.svelte';

const HOME = ['#/', { replace: true }];

beforeEach(() => {
  vi.clearAllMocks();
  push.pushStatus.mockReturnValue('default');
});

describe('NotificationsStep', () => {
  it('continues to Home once notifications are on', async () => {
    push.enablePush.mockResolvedValue('enabled');
    render(NotificationsStep);
    await fireEvent.click(screen.getByRole('button', { name: 'הפעלה' }));
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledWith(...HOME));
  });

  it('says so and offers a retry when this device could not be registered', async () => {
    push.enablePush.mockResolvedValueOnce('error').mockResolvedValueOnce('enabled');
    render(NotificationsStep);
    await fireEvent.click(screen.getByRole('button', { name: 'הפעלה' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו להפעיל את ההתראות');
    expect(router.navigate).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: 'נסו שוב' }));
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledWith(...HOME));
    expect(push.enablePush).toHaveBeenCalledTimes(2);
  });

  it('"אחר כך" still continues after a failure', async () => {
    push.enablePush.mockResolvedValue('error');
    render(NotificationsStep);
    await fireEvent.click(screen.getByRole('button', { name: 'הפעלה' }));
    await screen.findByRole('alert');
    await fireEvent.click(screen.getByRole('button', { name: 'אחר כך' }));
    expect(router.navigate).toHaveBeenCalledWith(...HOME);
  });

  it('a refused prompt continues (Settings explains how to allow it later)', async () => {
    push.enablePush.mockResolvedValue('denied');
    render(NotificationsStep);
    await fireEvent.click(screen.getByRole('button', { name: 'הפעלה' }));
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledWith(...HOME));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps "הפעלה" when allowed but not registered on this device yet', () => {
    push.pushStatus.mockReturnValue('unregistered');
    render(NotificationsStep);
    expect(screen.getByText('ההתראות עוד לא מגיעות למכשיר הזה')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הפעלה' })).toBeInTheDocument();
  });

  it('offers only "המשך" once this device is registered', () => {
    push.pushStatus.mockReturnValue('granted');
    render(NotificationsStep);
    expect(screen.getByText('ההתראות פעילות במכשיר הזה')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'הפעלה' })).toBeNull();
    expect(screen.getByRole('button', { name: 'המשך' })).toBeInTheDocument();
  });
});
