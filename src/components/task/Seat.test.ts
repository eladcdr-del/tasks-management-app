// @vitest-environment jsdom
// The seat at the end of a row (feature "seat"), on the demo seed signed in as מיכל: the owner's
// avatar; the empty seat that takes the task or asks someone from its "מי לוקח?" menu (me first,
// then the others in the household's order, nobody suggested); a request that waits ("מחכה לדני")
// with take / ask someone else / withdraw; nothing for a request that waits for my own answer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import { DANI, DEMO_HOUSEHOLD_ID as HID, MICHAL } from '$lib/data/demo/seed';
import { household } from '$lib/state/household.svelte';
import { tasks } from '$lib/state/tasks.svelte';
import { ui } from '$lib/state/ui.svelte';
import { he } from '$lib/i18n/he';

// Svelte's motion helpers (pulled in through '$components/ui') read prefers-reduced-motion on import.
// Reduced motion keeps the menu's exit instant here.
vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    }) as unknown as MediaQueryList;
});

import Seat from './Seat.svelte';

let repo: DemoRepository;
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};

async function as(uid: string) {
  repo.actAs(uid);
  household.uid = uid;
  tasks.setUser(uid);
  await settle();
}

/** A third member (a teenager) joins with a fresh invite. */
async function noaJoins() {
  const invite = await repo.createInvite(HID);
  repo.actAs('noa');
  await repo.joinHousehold(invite.code, {
    displayName: 'נועה',
    photoURL: null,
    color: 'plum',
    addressAs: 'f'
  });
  await as(MICHAL);
}

const task = (id: string) => tasks.byId(id)!;
const seat = () => document.querySelector<HTMLElement>('[data-seat]');
const menu = () => screen.queryByRole('menu');
const items = () => within(menu()!).getAllByRole('menuitem');
/** What each item says (its avatar is decorative). */
const labels = () => items().map((i) => i.querySelector('.label')?.textContent);

function mount(id: string, interactive = true) {
  return render(Seat, { task: task(id), interactive });
}

/** Re-renders with the task as the store has it now (the list passes the fresh task). */
async function refresh(r: ReturnType<typeof mount>, id: string) {
  await settle();
  await r.rerender({ task: task(id) });
  flushSync();
}

beforeEach(async () => {
  repo = await createDemoRepository({ persistence: 'none' });
  household.attach({ repo, householdId: HID });
  tasks.attach({ repo, householdId: HID });
  ui.queue = [];
  await as(MICHAL);
});

afterEach(async () => {
  cleanup();
  tasks.detach();
  household.detach();
  await repo.dispose();
});

describe('Seat', () => {
  it('an owned task shows its owner, and nothing to tap', () => {
    mount('seed-dentist');
    expect(seat()?.dataset.seat).toBe('owned');
    expect(screen.getByRole('img', { name: 'אצל מיכל' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a free task: the empty seat opens "מי לוקח?", me first, then the others', async () => {
    mount('seed-bulbs');
    const button = screen.getByRole('button', { name: 'לקחת: לקנות נורות לסלון' });
    expect(button.dataset.seat).toBe('free');
    expect(button.textContent).toContain('לקחת');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(button);
    flushSync();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(menu()?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByText('מי לוקח?')).toBeTruthy();
    expect(labels()).toEqual(['אני', 'לבקש מדני']);
    // Focus moves into the menu.
    expect(document.activeElement).toBe(items()[0]);
  });

  it('"אני" takes the task; the seat becomes my avatar with the arrival', async () => {
    const r = mount('seed-bulbs');
    await fireEvent.click(seat()!);
    flushSync();
    await fireEvent.click(items()[0]!);
    await settle();
    expect(task('seed-bulbs').ownerId).toBe(MICHAL);
    expect(ui.current?.message).toBe('המשימה אצלך');
    await refresh(r, 'seed-bulbs');
    expect(menu()).toBeNull();
    expect(seat()?.dataset.seat).toBe('owned');
    expect(seat()?.classList.contains('arrive')).toBe(true);
    expect(screen.getByRole('img', { name: 'אצל מיכל' })).toBeTruthy();
  });

  it('"לבקש מדני" sends the request at once; its undo takes it back', async () => {
    const r = mount('seed-bulbs');
    await fireEvent.click(seat()!);
    flushSync();
    await fireEvent.click(screen.getByRole('menuitem', { name: 'לבקש מדני' }));
    await settle();
    // A proposal: nobody holds it until דני answers.
    expect(task('seed-bulbs')).toMatchObject({
      ownerId: null,
      requestedOf: DANI,
      requestedBy: MICHAL
    });
    expect(ui.current).toMatchObject({ message: 'הבקשה נשלחה לדני', action: he.common.undo });
    await refresh(r, 'seed-bulbs');
    expect(seat()?.dataset.seat).toBe('waiting');

    ui.current!.onAction!();
    await settle();
    expect(task('seed-bulbs')).toMatchObject({ ownerId: null, requestedOf: null });
  });

  it('a request I sent waits: "מחכה לדני", then take it, or withdraw it', async () => {
    tasks.request('seed-bulbs', DANI);
    await settle();
    const r = mount('seed-bulbs');
    const button = screen.getByRole('button', { name: 'מחכה לדני: לקנות נורות לסלון' });
    expect(button.dataset.seat).toBe('waiting');
    expect(button.textContent).toContain('ד');
    expect(button.textContent).toContain('מחכה לדני');

    await fireEvent.click(button);
    flushSync();
    expect(screen.getByText('ביקשת מדני')).toBeTruthy();
    // Nobody else to ask in a house of two; the one who asked may withdraw.
    expect(labels()).toEqual(['אני לוקחת', 'ביטול הבקשה']);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'ביטול הבקשה' }));
    await settle();
    expect(task('seed-bulbs')).toMatchObject({ ownerId: null, requestedOf: null });
    expect(ui.current?.message).toBe('הבקשה בוטלה');
    await refresh(r, 'seed-bulbs');
    expect(seat()?.dataset.seat).toBe('free');
  });

  it('in a bigger family: ask anyone; a request between two others offers no withdraw', async () => {
    await noaJoins();
    const r = mount('seed-bulbs');
    await fireEvent.click(seat()!);
    flushSync();
    // Household order (by joining): דני before נועה. Nobody is marked or suggested.
    expect(labels()).toEqual(['אני', 'לבקש מדני', 'לבקש מנועה']);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'לבקש מנועה' }));
    await settle();
    expect(task('seed-bulbs').requestedOf).toBe('noa');
    await refresh(r, 'seed-bulbs');

    // Asking someone else instead: the menu leaves out the one already asked.
    await fireEvent.click(seat()!);
    flushSync();
    expect(labels()).toEqual(['אני לוקחת', 'לבקש מדני', 'ביטול הבקשה']);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'לבקש מדני' }));
    await settle();
    expect(task('seed-bulbs').requestedOf).toBe(DANI);
    // Not a fresh request: no undo that would quietly drop it.
    expect(ui.queue.at(-1)).toMatchObject({ message: 'הבקשה נשלחה לדני' });
    expect(ui.queue.at(-1)?.action).toBeUndefined();
    cleanup();

    // נועה sees מיכל's request to דני: she may take it or ask someone else, not withdraw it.
    await as('noa');
    mount('seed-bulbs');
    await fireEvent.click(seat()!);
    flushSync();
    expect(screen.getByText('מיכל ביקשה מדני')).toBeTruthy();
    expect(labels()).toEqual(['אני לוקחת', 'לבקש ממיכל']);
  });

  it('a request waiting for MY answer leaves the seat empty (the row answers it)', () => {
    mount('seed-post'); // דני asked מיכל
    expect(seat()).toBeNull();
  });

  it('alone in the household the seat takes the task at once', async () => {
    // דני leaves; מיכל is alone.
    await as(DANI);
    await repo.leaveHousehold(HID);
    await as(MICHAL);
    mount('seed-bulbs');
    const button = screen.getByRole('button', { name: 'לקחת: לקנות נורות לסלון' });
    expect(button.getAttribute('aria-haspopup')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBeNull();
    await fireEvent.click(button);
    await settle();
    expect(menu()).toBeNull();
    expect(task('seed-bulbs').ownerId).toBe(MICHAL);
  });

  it('Escape closes the menu and gives focus back to the seat; so does a tap outside', async () => {
    mount('seed-bulbs');
    const button = seat()!;
    await fireEvent.click(button);
    flushSync();
    await fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    flushSync();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(button);
    flushSync();
    expect(menu()).toBeTruthy();
    // A tap outside: it closes the menu, and its click does nothing else.
    const outside = vi.fn();
    document.body.addEventListener('click', outside);
    await fireEvent.pointerDown(document.body);
    flushSync();
    expect(menu()).toBeNull();
    await fireEvent.click(document.body);
    expect(outside).not.toHaveBeenCalled();
    document.body.removeEventListener('click', outside);
    // Nothing was taken or asked.
    expect(task('seed-bulbs').ownerId).toBeNull();
    expect(task('seed-bulbs').requestedOf ?? null).toBeNull();
  });

  it('arrow keys move through the items; Tab lets the menu go', async () => {
    mount('seed-bulbs');
    await fireEvent.click(seat()!);
    flushSync();
    const [me, dani] = items();
    await fireEvent.keyDown(me!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(dani);
    await fireEvent.keyDown(dani!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(me);
    await fireEvent.keyDown(me!, { key: 'End' });
    expect(document.activeElement).toBe(dani);
    await fireEvent.keyDown(dani!, { key: 'Tab' });
    flushSync();
    expect(menu()).toBeNull();
  });

  it('a picture only while choosing several (no button, no menu)', () => {
    mount('seed-bulbs', false);
    expect(seat()?.dataset.seat).toBe('free');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
