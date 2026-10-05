// @vitest-environment jsdom
// Requests in the UI, on the demo seed (דני asked מיכל to pick up the parcel; she has not
// answered): the TaskCard line and the TaskDetail owner block from both sides, and the answers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import { DANI, DEMO_HOUSEHOLD_ID as HID, MICHAL } from '$lib/data/demo/seed';
import { household } from '$lib/state/household.svelte';
import { tasks } from '$lib/state/tasks.svelte';
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

import TaskCard from './TaskCard.svelte';
import OwnerBlock from '../../screens/TaskDetail/OwnerBlock.svelte';
import RequestSheet from '../../sheets/RequestSheet.svelte';

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

const task = (id: string) => tasks.byId(id)!;
const card = (id: string) => render(TaskCard, { task: task(id) });
const block = (id: string) => render(OwnerBlock, { task: task(id) });
const line = () => document.querySelector('[data-request]:not(section)');

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

describe('TaskCard request line', () => {
  it('calls the asked member, quietly informs the asker', async () => {
    card('seed-post');
    expect(line()?.textContent).toBe('דני ביקש ממך');
    expect(line()?.getAttribute('data-request')).toBe('askedMe');
    expect(line()?.classList.contains('quiet')).toBe(false);
    cleanup();

    await as(DANI);
    card('seed-post');
    expect(line()?.textContent).toBe('ביקשת ממיכל · מחכה לתשובה');
    expect(line()?.classList.contains('quiet')).toBe(true);
    // Nobody holds it: the dashed "?" avatar, not מיכל's.
    expect(document.querySelector('[data-task-id="seed-post"]')?.getAttribute('data-owner')).toBe(
      ''
    );
  });

  it('once accepted: "לבקשת דני" for her, "לבקשתך" for him', async () => {
    await tasks.accept('seed-post');
    await settle();
    card('seed-post');
    expect(line()?.textContent).toBe('לבקשת דני');
    cleanup();
    await as(DANI);
    card('seed-post');
    expect(line()?.textContent).toBe('לבקשתך');
  });
});

describe('RequestSheet', () => {
  it('says a request is a proposal; the member it already waits for cannot be asked again', async () => {
    await as(DANI);
    render(RequestSheet, { taskId: 'seed-post', onClose: () => {} });
    const michal = screen.getByRole('radio', { name: /מיכל/ });
    expect(michal.getAttribute('aria-disabled') ?? String(michal.hasAttribute('disabled'))).toMatch(
      /true/
    );
    expect(screen.getByText('כבר מחכה לתשובה שלה')).toBeTruthy();
    expect(screen.getByText('עד שיאשרו, המשימה מחכה שמישהו ייקח.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'שליחת הבקשה' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('sends a request that leaves the task with nobody until they answer', async () => {
    let closed = false;
    render(RequestSheet, { taskId: 'seed-bulbs', onClose: () => (closed = true) });
    await fireEvent.click(screen.getByRole('button', { name: 'שליחת הבקשה' }));
    await settle();
    expect(closed).toBe(true);
    expect(task('seed-bulbs')).toMatchObject({
      ownerId: null,
      requestedOf: DANI,
      requestedBy: MICHAL
    });
    expect(ui.current?.message).toBe('הבקשה נשלחה לדני');
  });
});

describe('OwnerBlock', () => {
  const ownerLine = () => document.querySelector('.owner-line')?.textContent;
  const requestLine = () => document.querySelector('[data-request-line]')?.textContent;

  it('the asked member answers: "אני לוקחת" makes it hers', async () => {
    block('seed-post');
    expect(ownerLine()).toBe('דני ביקש ממך');
    expect(requestLine()).toBe('מחכה לתשובה שלך');
    expect(screen.queryByRole('button', { name: 'לבקש מ…' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'אני לוקחת' }));
    await settle();
    expect(task('seed-post')).toMatchObject({ ownerId: MICHAL, requestedBy: DANI });
    expect(ui.current?.message).toBe('המשימה אצלך');
  });

  it('…or "לא מתאים לי": the task waits for anyone, without blame', async () => {
    block('seed-post');
    await fireEvent.click(screen.getByRole('button', { name: 'לא מתאים לי' }));
    await settle();
    expect(task('seed-post')).toMatchObject({
      ownerId: null,
      requestedOf: null,
      requestedBy: null
    });
    expect(ui.current?.message).toBe('בסדר, המשימה תחכה שמישהו ייקח');
  });

  it('the asker sees it waiting and may withdraw it (or still take it)', async () => {
    await as(DANI);
    block('seed-post');
    expect(ownerLine()).toBe('מחכה שמישהו ייקח');
    expect(requestLine()).toBe('ביקשת ממיכל · מחכה לתשובה');
    expect(screen.getByRole('button', { name: 'אני לוקח' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'ביטול הבקשה' }));
    await settle();
    expect(task('seed-post')).toMatchObject({ requestedOf: null, requestedBy: null });
    expect(ui.current?.message).toBe('הבקשה בוטלה');
  });

  it('an accepted request is quiet history under the owner', async () => {
    await tasks.accept('seed-post');
    await settle();
    block('seed-post');
    expect(ownerLine()).toBe('אצלך');
    expect(requestLine()).toBe('לבקשת דני');
    cleanup();
    await as(DANI);
    block('seed-post');
    expect(ownerLine()).toBe('אצל מיכל');
    expect(requestLine()).toBe('לבקשתך');
    expect(screen.queryByRole('button', { name: 'ביטול הבקשה' })).toBeNull();
  });
});
