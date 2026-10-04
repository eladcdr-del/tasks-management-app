import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepoError } from '$lib/data/repository';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import { DEMO_HOUSEHOLD_ID } from '$lib/data/demo/seed';
import { he } from '$lib/i18n/he';
import { errorMessage, UiStore } from './ui.svelte';

const NOW = Date.parse('2026-10-04T09:00:00+03:00');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('UiStore snackbar queue', () => {
  it('queues in order; current is the oldest; dismiss removes by id (default: current)', () => {
    const ui = new UiStore();
    expect(ui.current).toBeNull();
    const a = ui.show('בוצע', { action: he.common.undo, onAction: () => {} });
    const b = ui.show('נשמר');
    expect(ui.current).toMatchObject({ id: a, message: 'בוצע', action: he.common.undo });
    expect(ui.queue.map((s) => s.id)).toEqual([a, b]);
    ui.dismiss(b);
    expect(ui.queue.map((s) => s.id)).toEqual([a]);
    ui.dismiss();
    expect(ui.current).toBeNull();
    ui.dismiss(); // nothing to dismiss: no-op
    ui.dismiss(999);
    expect(ui.queue).toEqual([]);
  });

  it('passes the duration through for the Snackbar primitive', () => {
    const ui = new UiStore();
    ui.show('נמחקה', { duration: 5000 });
    expect(ui.current?.duration).toBe(5000);
  });
});

describe('errors', () => {
  it('maps RepoError codes through he.errors, falling back to the generic line', () => {
    const table: Partial<Record<string, string>> = he.errors;
    for (const code of ['network', 'permission', 'conflict', 'unknown'] as const) {
      expect(errorMessage(new RepoError(code))).toBe(table[code] ?? he.errors.generic);
    }
    expect(errorMessage(new Error('boom'))).toBe(he.errors.generic);
  });

  it('pushError shows the message once while the same one is waiting', () => {
    const ui = new UiStore();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = ui.pushError(new RepoError('network'));
    expect(ui.pushError(new RepoError('network'))).toBe(first);
    expect(ui.queue).toHaveLength(1);
    ui.pushError(new Error('not a RepoError')); // logged
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('bindRepo', () => {
  let repo: DemoRepository | null = null;
  afterEach(async () => {
    await repo?.dispose();
    repo = null;
  });

  it('turns asynchronous write failures (onWriteError) into snackbars until unbound', async () => {
    repo = await createDemoRepository({ now: () => NOW, persistence: 'none' });
    const ui = new UiStore();
    ui.bindRepo(repo);
    repo.updateTask(DEMO_HOUSEHOLD_ID, 'no-such-task', { title: 'x' });
    await flush();
    expect(ui.current?.message).toBe(errorMessage(new RepoError('not-found')));

    ui.dismiss();
    ui.unbindRepo();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    repo.updateTask(DEMO_HOUSEHOLD_ID, 'no-such-task', { title: 'x' });
    await flush();
    expect(ui.queue).toEqual([]);
    warn.mockRestore();
  });

  it('binding again replaces the previous binding (one listener)', async () => {
    repo = await createDemoRepository({ now: () => NOW, persistence: 'none' });
    const ui = new UiStore();
    const show = vi.spyOn(ui, 'show');
    ui.bindRepo(repo);
    ui.bindRepo(repo);
    repo.updateTask(DEMO_HOUSEHOLD_ID, 'no-such-task', { title: 'x' });
    await flush();
    expect(show).toHaveBeenCalledTimes(1);
  });
});
