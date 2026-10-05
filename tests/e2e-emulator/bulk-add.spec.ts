// Quick add's list mode (feature bulk-add) in Firebase mode, against the emulators (rules
// enforced): a pasted list of 15 reaches the server as 15 unowned tasks with one "created" event
// each and nothing waiting for a push; a list added offline waits in the queue and lands once the
// connection is back, like single adds.
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock \
//     npx firebase emulators:exec --only auth,firestore --project demo-homecare \
//     "npx playwright test --project=emulator tests/e2e-emulator/bulk-add.spec.ts"

import type { Locator, Page } from '@playwright/test';
import { EMULATOR_PROJECT, expect, signIn, test } from './fixtures';

interface Hooks {
  state: {
    session: {
      phase: string;
      createHousehold(
        name: string,
        profile: { displayName: string; photoURL: null; color: string; addressAs: string }
      ): Promise<string>;
    };
    sync: { status: string; pendingWrites: number };
    ui: { current: { message: string } | null };
  };
}
type HookWindow = Window & { __homecareTest?: Hooks };

interface Doc {
  name: string;
  fields: Record<string, { stringValue?: string; nullValue?: null }>;
}

const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}`;
// Unique accounts and no clearEmulators(): other emulator specs may run in parallel workers.
const RUN = Date.now().toString(36);

test.use({ now: null });

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase,
    { timeout: 20_000 }
  );
const syncState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as HookWindow).__homecareTest!.state.sync;
    return { status: s.status, pendingWrites: s.pendingWrites };
  });
const snack = (page: Page) =>
  page.evaluate(
    () => (window as unknown as HookWindow).__homecareTest!.state.ui.current?.message ?? ''
  );

/** Every document of a household subcollection, read on the server (admin access). */
async function serverDocs(hid: string, collection: 'tasks' | 'events'): Promise<Doc[]> {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents/households/${hid}/${collection}?pageSize=300`,
    { headers: { Authorization: 'Bearer owner' } }
  );
  if (!res.ok) throw new Error(`${collection}: ${res.status}`);
  return ((await res.json()) as { documents?: Doc[] }).documents ?? [];
}
const str = (d: Doc, key: string) => d.fields[key]?.stringValue ?? null;

async function paste(field: Locator, text: string) {
  await field.focus();
  await field.evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );
  }, text);
}

/** Opens quick add, pastes `lines` as a numbered list and adds them all. */
async function addList(page: Page, lines: readonly string[]) {
  await page.locator('[data-fab]').click();
  await paste(
    page.getByTestId('quick-add').getByLabel('מה צריך לעשות?'),
    lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
  );
  const sheet = page.getByTestId('quick-add-list');
  await expect(sheet.locator('[data-row]')).toHaveCount(lines.length);
  await sheet.locator('[data-list-add]').click();
  await expect(sheet).toHaveCount(0);
}

test('a pasted list of 15 reaches the server: unowned, one created event each, no push', async ({
  page,
  context
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./?emulator=1#/');
  await phaseIs(page, 'signed-out');
  await signIn(page, `bulk-${RUN}`, 'מיכל');
  await phaseIs(page, 'no-household');
  const hid = await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest!.state.session.createHousehold('הבית שלנו', {
      displayName: 'מיכל',
      photoURL: null,
      color: 'terracotta',
      addressAs: 'f'
    })
  );
  await phaseIs(page, 'ready');

  const list = Array.from({ length: 15 }, (_, i) => `משימה מהרשימה ${i + 1}`);
  await addList(page, list);
  await expect.poll(() => snack(page)).toBe('נוספו 15 משימות');
  await expect(page.locator('[data-pulse="waiting"]')).toHaveText('15');

  await expect
    .poll(async () => (await serverDocs(hid, 'tasks')).length, { timeout: 15_000 })
    .toBe(15);
  const tasks = await serverDocs(hid, 'tasks');
  expect(tasks.map((d) => str(d, 'title')).sort()).toEqual([...list].sort());
  expect(tasks.every((d) => 'nullValue' in (d.fields.ownerId ?? {}))).toBe(true);
  await expect
    .poll(
      async () =>
        (await serverDocs(hid, 'events')).filter((e) => str(e, 'type') === 'created').length
    )
    .toBe(15);
  const events = await serverDocs(hid, 'events');
  // No request among them, so nothing is waiting for the notifier to push.
  expect(events.filter((e) => str(e, 'push') !== 'none').map((e) => str(e, 'type'))).toEqual([]);

  // Offline: a second list is queued and shown at once, then sent when the connection returns.
  await context.setOffline(true);
  const offline = ['לקנות חלב בלי רשת', 'לתקן ברז בלי רשת', 'לשלם ארנונה בלי רשת'];
  await addList(page, offline);
  await expect.poll(() => snack(page)).toBe('נוספו 3 משימות');
  for (const title of offline) await expect(page.getByText(title).first()).toBeAttached();
  await expect.poll(() => syncState(page)).toEqual({ status: 'offline', pendingWrites: 3 });

  await context.setOffline(false);
  await expect
    .poll(() => syncState(page), { timeout: 20_000 })
    .toEqual({ status: 'synced', pendingWrites: 0 });
  const after = (await serverDocs(hid, 'tasks')).map((d) => str(d, 'title'));
  for (const title of offline) expect(after).toContain(title);
  expect(errors).toEqual([]);
});
