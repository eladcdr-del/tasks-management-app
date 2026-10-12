// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { ui } from '$lib/state/ui.svelte';
import { household } from '$lib/state/household.svelte';

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
  testPush: vi.fn(),
  appPermissionMissing: vi.fn((): 'ask' | 'blocked' | null => null),
  onPushRegistrationChange: vi.fn((_cb: () => void) => () => {})
}));
const install = vi.hoisted(() => ({
  installState: vi.fn(() => ({ installed: false, canPrompt: false }))
}));
vi.mock('$lib/platform/push', () => push);
vi.mock('$lib/platform/install', () => install);
vi.mock('$lib/state/household.svelte', () => ({
  household: {
    me: {
      addressAs: 'f',
      notify: {
        requests: true,
        reminders: true,
        partnerDone: true,
        weekly: true,
        newTasks: true,
        soon: true,
        overdue: true
      }
    },
    updateMember: vi.fn()
  }
}));

import NotificationSettings from './NotificationSettings.svelte';

const status = () => document.querySelector('[data-push-status]')?.textContent;
/** The switch whose row is labelled `label` (its accessible name includes the description too). */
const switchFor = (label: string) =>
  screen.getByRole('switch', { name: (name) => name.startsWith(`${label} `) });
/** Each settings path in `el` (StepPath) as its label and steps. */
const paths = (el: Element) =>
  [...el.querySelectorAll('.path')].map((p) => [
    p.querySelector('.label')?.textContent ?? '',
    ...[...p.querySelectorAll('bdi')].map((b) => b.textContent)
  ]);

beforeEach(() => {
  vi.clearAllMocks();
  ui.queue = [];
  install.installState.mockReturnValue({ installed: false, canPrompt: false });
  push.appPermissionMissing.mockReturnValue(null);
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

  it('explains how to allow notifications again in the installed app', () => {
    push.pushStatus.mockReturnValue('denied');
    install.installState.mockReturnValue({ installed: true, canPrompt: false });
    render(NotificationSettings);
    expect(status()).toBe('ההתראות חסומות במכשיר הזה');
    const help = document.querySelector('[data-denied-help]')!;
    expect(help).toHaveTextContent('לחיצה ארוכה על הסמל של HomeCare');
    expect(help).toHaveTextContent('"פרטי האפליקציה" ← "התראות"');
    expect(help).not.toHaveTextContent('הכתובת');
  });

  it('and in a Chrome tab', () => {
    push.pushStatus.mockReturnValue('denied');
    render(NotificationSettings);
    const help = document.querySelector('[data-denied-help]')!;
    expect(help).toHaveTextContent('הסמל שליד הכתובת');
    expect(help).not.toHaveTextContent('פרטי האפליקציה');
  });

  it('describes the reminder and completion switches as the notifier sends them', () => {
    push.pushStatus.mockReturnValue('granted');
    render(NotificationSettings);
    expect(screen.getByText('בבוקר של יום היעד, וערב לפני מועד אחרון')).toBeInTheDocument();
    expect(screen.getByText('כשמישהו אחר בבית מסיים משימה')).toBeInTheDocument();
  });

  it('has one switch per kind, in order, each with what it sends', () => {
    push.pushStatus.mockReturnValue('demo');
    render(NotificationSettings);
    const switches = screen.getAllByRole('switch');
    expect(switches.map((s) => s.closest('label')?.querySelector('.label')?.textContent)).toEqual([
      'בקשות',
      'משימות חדשות',
      'תזכורות',
      'לפני השעה',
      'משימות באיחור',
      'משימות שהושלמו',
      'סיכום שבועי'
    ]);
    expect(switches.every((s) => (s as HTMLInputElement).checked)).toBe(true);
    expect(switchFor('משימות חדשות')).toHaveAccessibleDescription(
      'כשמישהו אחר מוסיף משימות לבית. כמה ביחד מגיעות בהתראה אחת'
    );
    expect(switchFor('לפני השעה')).toHaveAccessibleDescription('חצי שעה לפני משימה שנקבעה לה שעה');
    expect(switchFor('משימות באיחור')).toHaveAccessibleDescription(
      'בבוקר, כשעבר המועד של\u00a0משימה\u00a0שלך או של\u00a0משימה פנויה'
    );
  });

  it.each(['newTasks', 'soon', 'overdue'] as const)(
    'turning %s off saves my switches with only that one changed',
    async (key) => {
      push.pushStatus.mockReturnValue('demo');
      render(NotificationSettings);
      const label = {
        newTasks: 'משימות חדשות',
        soon: 'לפני השעה',
        overdue: 'משימות באיחור'
      }[key];
      await fireEvent.click(switchFor(label));
      expect(household.updateMember).toHaveBeenCalledTimes(1);
      expect(household.updateMember).toHaveBeenCalledWith({
        notify: { ...household.me!.notify, [key]: false }
      });
    }
  );
});

describe('בדיקת התראות', () => {
  const testButton = () => screen.queryByRole('button', { name: 'בדיקת התראות' });
  const result = () => document.querySelector('[data-test-result]');

  it('sends one from the phone and asks for one from the server, then says what to expect', async () => {
    push.pushStatus.mockReturnValue('granted');
    push.testPush.mockResolvedValue({ local: true, server: true });
    render(NotificationSettings);
    expect(result()).toBeNull();
    await fireEvent.click(testButton()!);
    expect(push.testPush).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(result()).not.toBeNull());
    const panel = result()!;
    expect(panel.closest('[role="status"]')).not.toBeNull();
    expect(panel).toHaveTextContent(
      'שלחנו התראה לטלפון הזה עכשיו, ותוך כמה דקות תגיע עוד אחת מהשרת.'
    );
    expect(panel).toHaveTextContent('הראשונה לא הופיעה? כנראה שההתראות חסומות בטלפון');
    expect(paths(panel)).toEqual([
      ['באפליקציה:', 'לחיצה ארוכה על הסמל של HomeCare', '"פרטי האפליקציה"', '"התראות"', 'לאפשר'],
      ['בכרום:', '⋮', '"הגדרות"', '"הגדרות אתר"', '"התראות"', 'eladcdr-del.github.io', 'לאפשר']
    ]);
    // the arrows are decoration; a screen reader hears commas between the steps
    for (const arrow of panel.querySelectorAll('.path [aria-hidden="true"]')) {
      expect(arrow.textContent?.trim()).toBe('←');
    }
    // addressed to her ("ספרי לנו"), from household.me
    expect(panel).toHaveTextContent(
      'הראשונה הופיעה והשנייה לא הגיעה תוך 10 דקות? ספרי לנו ונבדוק.'
    );
  });

  it('is there while allowed but not registered too, next to the retry', () => {
    push.pushStatus.mockReturnValue('unregistered');
    render(NotificationSettings);
    expect(screen.getByRole('button', { name: 'הפעלה מחדש' })).toBeInTheDocument();
    expect(testButton()).toBeInTheDocument();
  });

  it.each(['default', 'denied', 'unsupported', 'not-configured', 'demo'])(
    'is not offered while notifications are %s',
    (state) => {
      push.pushStatus.mockReturnValue(state);
      render(NotificationSettings);
      expect(testButton()).toBeNull();
    }
  );

  it('says so when the server could not be asked (no "tell us" line then)', async () => {
    push.pushStatus.mockReturnValue('granted');
    push.testPush.mockResolvedValue({ local: true, server: false });
    render(NotificationSettings);
    await fireEvent.click(testButton()!);
    await vi.waitFor(() => expect(result()).not.toBeNull());
    expect(result()).toHaveTextContent('את ההתראה מהשרת לא הצלחנו לבקש כרגע');
    expect(result()).not.toHaveTextContent('ספרי לנו');
  });

  it('when the phone could not show one, goes straight to allowing notifications', async () => {
    push.pushStatus.mockReturnValue('granted');
    push.testPush.mockResolvedValue({ local: false, server: true });
    render(NotificationSettings);
    await fireEvent.click(testButton()!);
    await vi.waitFor(() => expect(result()).not.toBeNull());
    expect(result()).toHaveTextContent('לא הצלחנו להציג התראה בטלפון הזה עכשיו');
    expect(result()).toHaveTextContent('כנראה שההתראות חסומות בטלפון. כך מאפשרים אותן:');
    expect(result()).not.toHaveTextContent('הראשונה לא הופיעה');
  });
});

describe('the installed app without its own permission', () => {
  it('says it must be allowed here once, with "אישור התראות"', async () => {
    push.pushStatus.mockReturnValue('default');
    push.appPermissionMissing.mockReturnValue('ask');
    push.enablePush.mockImplementation(async () => {
      push.pushStatus.mockReturnValue('granted');
      push.appPermissionMissing.mockReturnValue(null);
      return 'enabled';
    });
    render(NotificationSettings);
    expect(status()).toBe('כדי שההתראות יגיעו גם לאפליקציה המותקנת, צריך לאשר אותן כאן פעם אחת');
    await fireEvent.click(screen.getByRole('button', { name: 'אישור התראות' }));
    await vi.waitFor(() => expect(status()).toBe('ההתראות פעילות במכשיר הזה'));
    expect(screen.getByRole('button', { name: 'בדיקת התראות' })).toBeInTheDocument();
  });
});
