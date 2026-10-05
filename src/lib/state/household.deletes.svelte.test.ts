// @vitest-environment jsdom
// HouseholdStore: deleting the jar and earned treats with an undo window (like tasks.remove).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import { DANI, DEMO_HOUSEHOLD_ID as HID, MICHAL } from '$lib/data/demo/seed';
import { he } from '$lib/i18n/he';
import { HouseholdStore, SETTLE_MS, UNDO_MS } from './household.svelte';
import { UiStore } from './ui.svelte';

const NOW = Date.parse('2026-10-04T09:00:00+03:00');

let repo: DemoRepository;
let ui: UiStore;
let store: HouseholdStore;

beforeEach(async () => {
  repo = await createDemoRepository({ now: () => NOW, persistence: 'none' });
  ui = new UiStore();
  ui.bindRepo(repo);
  store = new HouseholdStore({ ui });
  store.setUser(MICHAL);
  store.attach({ repo, householdId: HID });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(async () => {
  vi.useRealTimers();
  store.detach();
  await repo.dispose();
  vi.restoreAllMocks();
});

const setVisibility = (v: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: v });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('deleteJar', () => {
  it('the jar is gone at once, with "הצנצנת נמחקה · ביטול"; it is deleted after the undo window', () => {
    const del = vi.spyOn(repo, 'deleteJar');
    expect(store.jar?.round).toBe(3);
    store.deleteJar();
    expect(store.jar).toBeNull();
    expect(store.household?.jar).not.toBeNull(); // nothing written yet
    expect(ui.current).toMatchObject({ message: 'הצנצנת נמחקה', action: he.common.undo });
    expect(store.treats).toHaveLength(2);

    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(del).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(del).toHaveBeenCalledWith(HID);
    expect(store.household).toMatchObject({ jar: null, nextJarRound: 4 });
    expect(store.jar).toBeNull();
    expect(store.treats.map((t) => t.id)).toEqual(['2', '1']); // the history stays
    expect(store.undoDeleteJar()).toBe(false); // too late
  });

  it('"ביטול" brings back exactly the same jar, and nothing is written', () => {
    const del = vi.spyOn(repo, 'deleteJar');
    const before = store.jar;
    store.deleteJar();
    ui.current!.onAction!();
    expect(store.jar).toEqual(before);
    vi.advanceTimersByTime(UNDO_MS * 2);
    expect(del).not.toHaveBeenCalled();
    expect(store.undoDeleteJar()).toBe(false);
  });

  it('a second delete while one waits, or with no jar, does nothing', () => {
    const show = vi.spyOn(ui, 'show');
    store.deleteJar();
    store.deleteJar();
    expect(show).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UNDO_MS);
    store.deleteJar(); // no jar any more
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('a new jar set up during the undo window deletes the old one first and starts after it', () => {
    store.deleteJar();
    store.setJar({ treat: 'ערב סרט', mode: 'each', share: 2 });
    expect(store.jar).toMatchObject({ treat: 'ערב סרט', round: 4, count: 0, counts: {} });
    expect(ui.current?.message).not.toBe('הצנצנת נמחקה'); // the undo is gone with it
    vi.advanceTimersByTime(UNDO_MS);
    expect(store.jar?.treat).toBe('ערב סרט');
  });

  it('commits when the page is hidden, and on detach', () => {
    const del = vi.spyOn(repo, 'deleteJar');
    store.deleteJar();
    setVisibility('hidden');
    expect(del).toHaveBeenCalledTimes(1);
    expect(ui.queue.some((s) => s.message === 'הצנצנת נמחקה')).toBe(false);
    setVisibility('visible');

    store.setJar({ treat: 'גלידה', target: 5 });
    store.deleteJar();
    store.detach();
    expect(del).toHaveBeenCalledTimes(2);
  });

  it('a jar redeemed elsewhere during the undo window shows again and is not deleted', () => {
    // The seeded jar, full (both parts done), redeemed by דני's phone while mine waits.
    const del = vi.spyOn(repo, 'deleteJar');
    store.deleteJar();
    repo.actAs(DANI);
    repo.setJar(HID, { treat: 'ארוחה במסעדה', mode: 'each', share: 1 }); // now full
    repo.redeemJar(HID);
    repo.actAs(MICHAL);
    expect(store.jar?.round).toBe(4); // a new round: not the one I deleted
    vi.advanceTimersByTime(UNDO_MS);
    expect(del).not.toHaveBeenCalled();
    expect(store.jar?.round).toBe(4);
  });

  it('a sent delete stays hidden until the snapshot agrees (no flash of the old jar)', async () => {
    // A queued write that lands a moment later, like Firestore's.
    const real = repo.deleteJar.bind(repo);
    vi.spyOn(repo, 'deleteJar').mockImplementation((hid) => void setTimeout(() => real(hid), 30));
    store.deleteJar();
    vi.advanceTimersByTime(UNDO_MS);
    expect(store.household?.jar).not.toBeNull();
    expect(store.jar).toBeNull();
    vi.advanceTimersByTime(30);
    expect(store.household?.jar).toBeNull();
    expect(store.jar).toBeNull();
  });

  it('a refused delete shows the jar again after a while', () => {
    vi.spyOn(repo, 'deleteJar').mockImplementation(() => {}); // never lands
    store.deleteJar();
    vi.advanceTimersByTime(UNDO_MS);
    expect(store.jar).toBeNull();
    vi.advanceTimersByTime(SETTLE_MS);
    expect(store.jar?.round).toBe(3);
  });
});

describe('deleteTreat', () => {
  it('the treat leaves the history at once; "ביטול" puts it back; else it is deleted', () => {
    const del = vi.spyOn(repo, 'deleteTreat');
    store.deleteTreat('1');
    expect(store.treats.map((t) => t.id)).toEqual(['2']);
    expect(ui.current).toMatchObject({
      message: 'הצ׳ופר נמחק מההיסטוריה',
      action: he.common.undo
    });
    ui.current!.onAction!();
    expect(store.treats.map((t) => t.id)).toEqual(['2', '1']);

    store.deleteTreat('2');
    vi.advanceTimersByTime(UNDO_MS);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(HID, '2');
    expect(store.treats.map((t) => t.id)).toEqual(['1']);
    expect(store.jar?.round).toBe(3); // the jar is untouched
  });

  it('two treats at once each keep their own undo; an unknown treat does nothing', () => {
    const del = vi.spyOn(repo, 'deleteTreat');
    store.deleteTreat('1');
    store.deleteTreat('2');
    store.deleteTreat('9');
    expect(store.treats).toEqual([]);
    expect(store.undoDeleteTreat('1')).toBe(true);
    expect(store.treats.map((t) => t.id)).toEqual(['1']);
    vi.advanceTimersByTime(UNDO_MS);
    expect(del.mock.calls).toEqual([[HID, '2']]);
  });

  it('commits on flushDeletes, dismissing its snackbar', () => {
    const del = vi.spyOn(repo, 'deleteTreat');
    store.deleteTreat('1');
    store.flushDeletes();
    expect(del).toHaveBeenCalledWith(HID, '1');
    expect(ui.current).toBeNull();
    expect(store.treats.map((t) => t.id)).toEqual(['2']);
    expect(store.undoDeleteTreat('1')).toBe(false);
  });

  it('when the window ends, the snackbar on screen times out by itself; one still queued goes', () => {
    store.deleteTreat('1');
    vi.advanceTimersByTime(UNDO_MS);
    expect(ui.current?.message).toBe('הצ׳ופר נמחק מההיסטוריה'); // its own timer closes it

    ui.dismiss();
    ui.show('הודעה אחרת');
    store.deleteTreat('2'); // waits behind it
    vi.advanceTimersByTime(UNDO_MS);
    expect(ui.queue.map((s) => s.message)).toEqual(['הודעה אחרת']);
  });

  it('a refused delete brings the treat back after a while', () => {
    vi.spyOn(repo, 'deleteTreat').mockImplementation(() => {});
    store.deleteTreat('1');
    vi.advanceTimersByTime(UNDO_MS);
    expect(store.treats.map((t) => t.id)).toEqual(['2']);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(store.treats.map((t) => t.id)).toEqual(['2', '1']);
  });
});

describe('while detached', () => {
  it('deleting does nothing', () => {
    store.detach();
    const show = vi.spyOn(ui, 'show');
    store.deleteJar();
    store.deleteTreat('1');
    expect(show).not.toHaveBeenCalled();
  });
});
