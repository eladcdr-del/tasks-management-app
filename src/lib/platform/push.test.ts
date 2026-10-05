// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from '$lib/data/repository';
import type { StorageLike } from '$lib/data/select';
import {
  DEVICE_ID_KEY,
  PUSH_REG_KEY,
  appHash,
  disablePush,
  enablePush,
  forgetPushRegistration,
  getDeviceId,
  onPushRegistrationChange,
  pushRegistered,
  pushStatus,
  pushSupport,
  refreshPush,
  type PushDeps
} from './push';

const CONFIG = {
  apiKey: 'k',
  authDomain: 'p.firebaseapp.com',
  projectId: 'p',
  appId: '1:2:web:3',
  messagingSenderId: '2'
};

function memStorage(init: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  };
}

function fakeWin(permission: NotificationPermission, answer: NotificationPermission = permission) {
  const Notification = {
    permission,
    requestPermission: vi.fn(async () => {
      Notification.permission = answer;
      return answer;
    })
  };
  const win = {
    Notification,
    PushManager: function PushManager() {},
    isSecureContext: true,
    navigator: { serviceWorker: {}, userAgent: 'TestUA/1.0' }
  };
  return { win: win as unknown as PushDeps['win'], Notification };
}

function fakeRepo() {
  return {
    kind: 'firebase',
    app: { name: 'app' },
    registerDevice: vi.fn(async () => {}),
    unregisterDevice: vi.fn(async () => {})
  };
}

function fakeMessaging(token: string | null = 'tok-1') {
  return {
    getPushToken: vi.fn(async () => token),
    deletePushToken: vi.fn(async () => {}),
    onForegroundMessage: vi.fn(async () => () => {})
  };
}

function deps(over: Partial<PushDeps> & { permission?: NotificationPermission } = {}) {
  const { permission = 'granted', ...rest } = over;
  const { win, Notification } = fakeWin(permission);
  const repo = fakeRepo();
  const messaging = fakeMessaging();
  const registration = { scope: '/tasks-management-app/' } as ServiceWorkerRegistration;
  const storage = memStorage({ [DEVICE_ID_KEY]: 'device-1' });
  const d: PushDeps = {
    mode: 'firebase',
    repo: repo as unknown as Repository,
    householdId: 'h1',
    config: CONFIG,
    vapidKey: '',
    win,
    storage,
    loadMessaging: vi.fn(async () => messaging as never),
    swReady: vi.fn(async () => registration),
    now: () => 1_000_000,
    onForeground: vi.fn(),
    ...rest
  };
  return { d, repo, messaging, registration, storage, Notification };
}

afterEach(() => vi.restoreAllMocks());

describe('pushSupport', () => {
  it('reports demo and not-configured before looking at the browser', () => {
    expect(pushSupport(deps({ mode: 'demo' }).d)).toBe('demo');
    expect(pushSupport(deps({ mode: 'setup' }).d)).toBe('not-configured');
    expect(pushSupport(deps({ config: { ...CONFIG, apiKey: ' ' } }).d)).toBe('not-configured');
  });

  it('reports unsupported without Notification, service workers or PushManager', () => {
    expect(pushSupport(deps({ win: null }).d)).toBe('unsupported');
    const { win } = fakeWin('default');
    delete (win as unknown as Record<string, unknown>).PushManager;
    expect(pushSupport(deps({ win }).d)).toBe('unsupported');
  });

  it('mirrors the permission otherwise', () => {
    expect(pushSupport(deps({ permission: 'default' }).d)).toBe('default');
    expect(pushSupport(deps({ permission: 'granted' }).d)).toBe('granted');
    expect(pushSupport(deps({ permission: 'denied' }).d)).toBe('denied');
  });
});

describe('pushStatus', () => {
  it('is granted only once this device is registered for the current household', () => {
    const none = deps();
    expect(pushRegistered(none.d)).toBe(false);
    expect(pushStatus(none.d)).toBe('unregistered');

    const here = deps();
    here.storage.setItem(PUSH_REG_KEY, 'h1|tok-1|999000');
    expect(pushRegistered(here.d)).toBe(true);
    expect(pushStatus(here.d)).toBe('granted');

    const elsewhere = deps();
    elsewhere.storage.setItem(PUSH_REG_KEY, 'h0|tok-1|999000');
    expect(pushStatus(elsewhere.d)).toBe('unregistered');

    const noHousehold = deps({ householdId: null });
    noHousehold.storage.setItem(PUSH_REG_KEY, 'h1|tok-1|999000');
    expect(pushRegistered(noHousehold.d)).toBe(false);
  });

  it('passes every other state through', () => {
    expect(pushStatus(deps({ permission: 'default' }).d)).toBe('default');
    expect(pushStatus(deps({ permission: 'denied' }).d)).toBe('denied');
    expect(pushStatus(deps({ mode: 'demo' }).d)).toBe('demo');
    expect(pushStatus(deps({ win: null }).d)).toBe('unsupported');
  });

  it('turns granted after a successful enable, and notifies listeners of the change', async () => {
    const { d, Notification } = deps({ permission: 'default' });
    Notification.requestPermission.mockImplementation(async () => {
      Notification.permission = 'granted';
      return 'granted';
    });
    const changed = vi.fn();
    const stop = onPushRegistrationChange(changed);
    await enablePush(d);
    expect(pushStatus(d)).toBe('granted');
    expect(changed).toHaveBeenCalledTimes(1);
    forgetPushRegistration(d.storage);
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
    forgetPushRegistration(d.storage);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('stays unregistered after a failed registration', async () => {
    const { d, repo, Notification } = deps({ permission: 'default' });
    Notification.requestPermission.mockImplementation(async () => {
      Notification.permission = 'granted';
      return 'granted';
    });
    repo.registerDevice.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(enablePush(d)).resolves.toBe('error');
    expect(pushStatus(d)).toBe('unregistered');
  });
});

describe('getDeviceId', () => {
  it('creates a UUID once and keeps it', () => {
    const storage = memStorage();
    const id = getDeviceId(storage);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.map.get(DEVICE_ID_KEY)).toBe(id);
    expect(getDeviceId(storage)).toBe(id);
  });

  it('still returns an id when storage is blocked', () => {
    expect(getDeviceId(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('enablePush', () => {
  it('asks for permission, gets a token on our SW and registers this device', async () => {
    const { d, repo, messaging, registration, storage, Notification } = deps({
      permission: 'default',
      vapidKey: 'VAPID'
    });
    Notification.requestPermission.mockImplementation(async () => 'granted');
    await expect(enablePush(d)).resolves.toBe('enabled');
    expect(messaging.getPushToken).toHaveBeenCalledWith(repo.app, registration, 'VAPID');
    expect(repo.registerDevice).toHaveBeenCalledWith({
      deviceId: 'device-1',
      householdId: 'h1',
      token: 'tok-1',
      userAgent: 'TestUA/1.0'
    });
    expect(storage.map.get(PUSH_REG_KEY)).toBe('h1|tok-1|1000000');
    expect(messaging.onForegroundMessage).toHaveBeenCalledTimes(1);
  });

  it('passes no VAPID key when the config leaves it empty', async () => {
    const { d, messaging, registration, repo } = deps({ permission: 'default' });
    d.win!.Notification.requestPermission = vi.fn(async () => 'granted' as const);
    await enablePush(d);
    expect(messaging.getPushToken).toHaveBeenCalledWith(repo.app, registration, undefined);
  });

  it('stops at a refused or dismissed prompt', async () => {
    const denied = deps({ permission: 'default' });
    denied.Notification.requestPermission.mockImplementation(async () => 'denied');
    await expect(enablePush(denied.d)).resolves.toBe('denied');
    expect(denied.d.loadMessaging).not.toHaveBeenCalled();

    const dismissed = deps({ permission: 'default' });
    await expect(enablePush(dismissed.d)).resolves.toBe('default');
    expect(dismissed.repo.registerDevice).not.toHaveBeenCalled();
  });

  it('never prompts in the demo or without Firebase', async () => {
    const demo = deps({ mode: 'demo', permission: 'default' });
    await expect(enablePush(demo.d)).resolves.toBe('unavailable');
    expect(demo.Notification.requestPermission).not.toHaveBeenCalled();
    expect(demo.d.loadMessaging).not.toHaveBeenCalled();
  });

  it('reports an error (and does not throw) when the token or the write fails', async () => {
    const noToken = deps();
    noToken.messaging.getPushToken.mockResolvedValue(null);
    await expect(enablePush(noToken.d)).resolves.toBe('error');

    const failing = deps();
    failing.repo.registerDevice.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(enablePush(failing.d)).resolves.toBe('error');
    expect(failing.storage.map.has(PUSH_REG_KEY)).toBe(false);
  });
});

describe('refreshPush', () => {
  it('does nothing unless permission is already granted', async () => {
    const { d } = deps({ permission: 'default' });
    await refreshPush(d);
    expect(d.loadMessaging).not.toHaveBeenCalled();
  });

  it('skips the write when the same token is registered for the same household', async () => {
    const { d, repo, storage } = deps();
    storage.setItem(PUSH_REG_KEY, 'h1|tok-1|999000');
    await refreshPush(d);
    expect(repo.registerDevice).not.toHaveBeenCalled();
  });

  it('rewrites when the token, the household or the week changed', async () => {
    const changedToken = deps();
    changedToken.storage.setItem(PUSH_REG_KEY, 'h1|tok-0|999000');
    await refreshPush(changedToken.d);
    expect(changedToken.repo.registerDevice).toHaveBeenCalledTimes(1);
    expect(changedToken.storage.map.get(PUSH_REG_KEY)).toBe('h1|tok-1|1000000');

    const otherHousehold = deps();
    otherHousehold.storage.setItem(PUSH_REG_KEY, 'h0|tok-1|999000');
    await refreshPush(otherHousehold.d);
    expect(otherHousehold.repo.registerDevice).toHaveBeenCalledTimes(1);

    const stale = deps({ now: () => 1_000_000 + 8 * 24 * 3600 * 1000 });
    stale.storage.setItem(PUSH_REG_KEY, 'h1|tok-1|1000000');
    await refreshPush(stale.d);
    expect(stale.repo.registerDevice).toHaveBeenCalledTimes(1);
  });

  it('registers again after the household was left', async () => {
    const { d, repo, storage } = deps();
    storage.setItem(PUSH_REG_KEY, 'h1|tok-1|999000');
    forgetPushRegistration(storage);
    await refreshPush(d);
    expect(repo.registerDevice).toHaveBeenCalledTimes(1);
  });

  it('swallows failures', async () => {
    const { d } = deps();
    vi.mocked(d.swReady).mockRejectedValue(new Error('no sw'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(refreshPush(d)).resolves.toBeUndefined();
  });
});

describe('disablePush', () => {
  it('unregisters this device and deletes the FCM token', async () => {
    const { d, repo, messaging, storage } = deps();
    storage.setItem(PUSH_REG_KEY, 'h1|tok-1|999000');
    await disablePush(d);
    expect(repo.unregisterDevice).toHaveBeenCalledWith('device-1');
    expect(messaging.deletePushToken).toHaveBeenCalledWith(repo.app);
    expect(storage.map.has(PUSH_REG_KEY)).toBe(false);
  });

  it('is a no-op when this device never registered', async () => {
    const { d, repo } = deps();
    await disablePush(d);
    expect(repo.unregisterDevice).not.toHaveBeenCalled();
    expect(d.loadMessaging).not.toHaveBeenCalled();
  });

  it('never rejects, even when the network is down', async () => {
    const { d, repo, storage } = deps();
    storage.setItem(PUSH_REG_KEY, 'h1|tok-1|999000');
    repo.unregisterDevice.mockRejectedValue(new Error('offline'));
    await expect(disablePush(d)).resolves.toBeUndefined();
  });
});

describe('appHash', () => {
  const base = 'https://eladcdr-del.github.io/tasks-management-app/';
  it('keeps in-app deep links', () => {
    expect(appHash(`${base}#/task/abc`, base)).toBe('#/task/abc');
    expect(appHash('#/task/abc', base)).toBe('#/task/abc');
    expect(appHash(base, base)).toBe('#/');
  });

  it('rejects foreign or missing URLs', () => {
    expect(appHash(undefined, base)).toBeNull();
    expect(appHash('https://evil.example/#/task/a', base)).toBeNull();
    expect(appHash('https://eladcdr-del.github.io/other/#/x', base)).toBeNull();
  });
});
