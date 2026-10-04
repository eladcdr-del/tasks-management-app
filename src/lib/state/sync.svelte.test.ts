// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { Repository } from '$lib/data/repository';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import type { SyncState } from '$lib/domain/types';
import { SyncStore } from './sync.svelte';

const NOW = Date.parse('2026-10-04T09:00:00+03:00');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A firebase-kind repository whose sync state the test drives. */
function fakeFirebase() {
  let emit: ((s: SyncState) => void) | null = null;
  let active = 0;
  const repo = {
    kind: 'firebase',
    watchSync(cb: (s: SyncState) => void) {
      emit = cb;
      active++;
      return () => {
        active--;
        emit = null;
      };
    }
  } as unknown as Repository;
  return { repo, emit: (s: SyncState) => emit?.(s), active: () => active };
}

let demo: DemoRepository | null = null;
afterEach(async () => {
  await demo?.dispose();
  demo = null;
  window.dispatchEvent(new Event('online'));
});

describe('SyncStore', () => {
  it('demo: synced, and stays synced offline (no network involved)', async () => {
    demo = await createDemoRepository({ now: () => NOW, persistence: 'none' });
    const sync = new SyncStore();
    sync.bindRepo(demo);
    await flush();
    expect(sync.status).toBe('synced');
    expect(sync.pendingWrites).toBe(0);
    window.dispatchEvent(new Event('offline'));
    expect(sync.online).toBe(false);
    expect(sync.status).toBe('synced');
  });

  it('firebase: follows watchSync; the device going offline shows offline', () => {
    const fb = fakeFirebase();
    const sync = new SyncStore();
    sync.bindRepo(fb.repo);
    fb.emit({ status: 'saving', pendingWrites: 2 });
    expect(sync.status).toBe('saving');
    expect(sync.pendingWrites).toBe(2);
    window.dispatchEvent(new Event('offline'));
    expect(sync.status).toBe('offline');
    expect(sync.pendingWrites).toBe(2);
    window.dispatchEvent(new Event('online'));
    expect(sync.status).toBe('saving');
  });

  it('rebinding never leaves two subscriptions; unbind resets and stops listening', () => {
    const fb = fakeFirebase();
    const sync = new SyncStore();
    sync.bindRepo(fb.repo);
    sync.bindRepo(fb.repo);
    expect(fb.active()).toBe(1);
    fb.emit({ status: 'offline', pendingWrites: 1 });
    sync.unbindRepo();
    expect(fb.active()).toBe(0);
    expect(sync.status).toBe('synced');
    expect(sync.pendingWrites).toBe(0);
    window.dispatchEvent(new Event('offline'));
    expect(sync.online).toBe(true); // listener removed
  });
});
