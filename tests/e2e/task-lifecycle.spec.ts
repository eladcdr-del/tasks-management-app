import { deflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// Task lifecycle (step 3.3): quick add with smart parsing → detail (edit) → complete with
// documentation → undo; a recurring task spawns its next instance; delete → undo.
// Fixed clock (fixtures.ts): Sunday 4 Oct 2026, 09:00 Asia/Jerusalem; "יום חמישי" = Thu 8 Oct.

interface TaskLite {
  id: string;
  title: string;
  status: 'open' | 'done';
  priority: string;
  ownerId: string | null;
  dueDate: string | null;
  hardDeadline: boolean;
  categoryId: string | null;
  seriesId: string | null;
  completion: { note: string; cost: number | null; photoIds: string[] } | null;
}
interface Hooks {
  actAs(uid: string): Promise<void>;
  state: {
    tasks: { open: TaskLite[]; done: TaskLite[]; byId(id: string): TaskLite | null };
    ui: { current: { message: string; action?: string; onAction?: () => void } | null };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const openTasks = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.open.map((t) => ({ ...t }))
  );
const taskById = (page: Page, id: string) =>
  page.evaluate((id) => {
    const t = (window as unknown as HookWindow).__homecareTest.state.tasks.byId(id);
    return t ? (JSON.parse(JSON.stringify(t)) as TaskLite) : null;
  }, id);
async function findOpen(page: Page, title: string): Promise<TaskLite> {
  await expect.poll(async () => (await openTasks(page)).some((t) => t.title === title)).toBe(true);
  const t = (await openTasks(page)).find((x) => x.title === title);
  if (!t) throw new Error(`no open task "${title}"`);
  return t;
}

/**
 * Runs the action of the snackbar on screen (asserting its message). SnackbarHost is built by the
 * shell step in parallel: while it is still the stub, the queued snack's action is invoked directly.
 */
async function snackAction(page: Page, message: RegExp): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as HookWindow).__homecareTest.state.ui.current?.message ?? ''
      )
    )
    .toMatch(message);
  if ((await page.locator('[data-stub="SnackbarHost"]').count()) > 0) {
    await page.evaluate(() => {
      const snack = (window as unknown as HookWindow).__homecareTest.state.ui.current;
      snack?.onAction?.();
    });
  } else {
    await page.getByRole('status').getByRole('button', { name: 'ביטול' }).click();
  }
}

/** A real PNG (solid sand colour) built here, for the photo picker. */
function makePng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array(width).fill([217, 119, 75]).flat())
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

test('quick add parses Hebrew into chips, a chip can be dismissed, adding stays open', async ({
  page
}) => {
  await openApp(page, '#/new');
  const sheet = page.getByTestId('quick-add');
  const input = sheet.getByLabel('מה צריך לעשות?');
  await expect(input).toBeFocused();

  await input.fill('להחזיר מכנסיים עד יום חמישי');
  const tokens = sheet.getByRole('list', { name: 'זוהה בטקסט' });
  const due = tokens.locator('[data-key^="due:"]');
  await expect(due).toContainText('עד יום ה׳ 8/10');
  await expect(due).toHaveAttribute('data-hard', 'true'); // returns + "עד" = hard deadline
  const category = tokens.locator('[data-key^="category:"]');
  await expect(category).toContainText('החזרות');
  // The picker row reflects the parse.
  // "מתי" is the plan (none yet); the due date is its own chip above, as in the task screen
  await expect(sheet.locator('[data-picker="when"]')).toContainText('בחירה');
  await expect(sheet.locator('[data-picker="category"]')).toContainText('החזרות');
  await shot(page, 'quick-add-chips');

  // Dismiss the category chip: it disappears, the date chip stays.
  await sheet.getByRole('button', { name: /ביטול הזיהוי: החזרות/ }).click();
  await expect(category).toHaveCount(0);
  await expect(due).toBeVisible();
  // The hard deadline came from the returns category, so it goes with it (fields stay coherent).
  await expect(due).not.toHaveAttribute('data-hard', 'true');

  // Explicit picks: priority "דחופה" (no "מי" is pre-selected).
  await expect(sheet.locator('[data-picker="owner"]')).toContainText('בחירה');
  await sheet.locator('[data-picker="priority"]').click();
  await sheet.locator('[data-priority="urgent"]').click();
  await expect(sheet.locator('[data-picker="priority"]')).toContainText('דחופה');

  await input.press('Enter');
  await expect(sheet.getByRole('status')).toContainText('נוסף ✓');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();

  const added = await findOpen(page, 'להחזיר מכנסיים');
  expect(added).toMatchObject({
    dueDate: '2026-10-08',
    hardDeadline: false,
    categoryId: null,
    priority: 'urgent',
    ownerId: null
  });

  // Rapid entry: a second one right away.
  await input.fill('לקנות נורות מחר');
  await sheet.getByRole('button', { name: 'הוספה' }).click();
  await findOpen(page, 'לקנות נורות');
});

test('detail: edit the title, complete with documentation and a photo, then undo', async ({
  page
}) => {
  await openApp(page, '#/task/seed-plumber');
  const detail = page.getByTestId('task-detail');
  const title = detail.getByLabel('כותרת המשימה');
  await expect(title).toHaveValue('להזמין אינסטלטור לנזילה מתחת לכיור');
  await expect(detail.getByRole('heading', { name: 'היסטוריה' })).toBeVisible();
  await shot(page, 'task-detail');

  await title.fill('להזמין אינסטלטור לנזילה במטבח');
  await title.press('Enter');
  await expect
    .poll(async () => (await taskById(page, 'seed-plumber'))?.title)
    .toBe('להזמין אינסטלטור לנזילה במטבח');
  await expect(detail.locator('[data-event="edited"]')).toContainText('מיכל עדכנה');

  // Complete with a note, a cost and a photo.
  await detail.getByRole('button', { name: 'בוצע', exact: true }).click();
  const sheet = page.getByTestId('complete-sheet');
  await expect(
    sheet.getByRole('heading', { name: 'כל הכבוד, עוד משימה ירדה מהרשימה' })
  ).toBeVisible();
  await sheet.getByRole('button', { name: /להוסיף תיעוד/ }).click();
  await sheet.getByLabel('הערה').fill('הוחלף סיפון מתחת לכיור');
  await sheet.getByLabel('עלות').fill('350');
  await sheet.getByLabel('איפה').fill('אינסטלציה כהן');
  await sheet.getByTestId('photo-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: makePng(64, 48)
  });
  await expect(sheet.getByRole('img', { name: 'תמונה 1' })).toBeVisible();
  await shot(page, 'complete-sheet');
  await sheet.getByRole('button', { name: 'סיום' }).click();
  await expect(sheet).toHaveCount(0);

  const doc = detail.getByTestId('documentation');
  await expect(doc).toContainText('הוחלף סיפון מתחת לכיור');
  await expect(doc).toContainText('350');
  await expect(doc).toContainText('אינסטלציה כהן');
  await expect(doc.locator('[data-photo-id]')).toHaveCount(1);
  const done = await taskById(page, 'seed-plumber');
  expect(done?.status).toBe('done');
  expect(done?.completion).toMatchObject({ note: 'הוחלף סיפון מתחת לכיור', cost: 350 });
  expect(done?.completion?.photoIds).toHaveLength(1);

  // The stored photo opens full screen; Back closes it.
  await doc.locator('[data-photo-id]').click();
  const viewer = page.getByTestId('photo-viewer');
  await expect(viewer.locator('img')).toBeVisible();
  await page.goBack();
  await expect(viewer).toHaveCount(0);
  await expect(detail).toBeVisible();

  await snackAction(page, /^בוצע/);
  await expect.poll(async () => (await taskById(page, 'seed-plumber'))?.status).toBe('open');
  await expect(detail.getByRole('button', { name: 'בוצע', exact: true })).toBeVisible();
});

test('completing a recurring task creates the next instance', async ({ page }) => {
  await openApp(page);
  const arnona = await findOpen(page, 'לשלם ארנונה');
  await openApp(page, `#/task/${arnona.id}`, { reset: false });
  const detail = page.getByTestId('task-detail');
  await expect(detail.locator('[data-field="recurrence"]')).toContainText('כל חודש');
  await detail.getByRole('button', { name: 'בוצע', exact: true }).click();
  await page.getByTestId('complete-sheet').getByRole('button', { name: 'סיום' }).click();

  await expect
    .poll(
      async () =>
        (await openTasks(page)).filter((t) => t.title === 'לשלם ארנונה' && t.id !== arnona.id)
          .length
    )
    .toBe(1);
  const next = (await openTasks(page)).find((t) => t.title === 'לשלם ארנונה' && t.id !== arnona.id);
  expect(next?.dueDate && arnona.dueDate && next.dueDate > arnona.dueDate).toBe(true);

  await detail.getByTestId('next-instance').click();
  await expect(page).toHaveURL(new RegExp(`#/task/${next?.id}$`));
  await expect(page.getByTestId('task-detail').getByLabel('כותרת המשימה')).toHaveValue(
    'לשלם ארנונה'
  );
});

test('delete leaves at once and can be undone within 5 seconds', async ({ page }) => {
  await openApp(page, '#/task/seed-bulbs');
  const detail = page.getByTestId('task-detail');
  await expect(detail.getByLabel('כותרת המשימה')).toHaveValue('לקנות נורות לסלון');
  await detail.getByRole('button', { name: 'מחיקה' }).click();
  await expect(page.getByTestId('task-detail')).toHaveCount(0);
  await expect.poll(() => taskById(page, 'seed-bulbs')).toBeNull();

  await snackAction(page, /המשימה נמחקה/);
  await expect
    .poll(async () => (await taskById(page, 'seed-bulbs'))?.title)
    .toBe('לקנות נורות לסלון');
});

test('the owner block speaks to the viewer about a request', async ({ page }) => {
  await openApp(page, '#/task/seed-post'); // דני asked מיכל
  const line = page.getByTestId('owner-block').locator('[data-request-line]');
  await expect(line).toHaveText('דני ביקש ממך');
  await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.actAs('dani'));
  await expect(line).toHaveText('ביקשת ממיכל');
});

/** Pixels from the bottom of the snackbar on screen to the top of `selector` (≥ 0: no overlap). */
async function gapAbove(page: Page, selector: string): Promise<number> {
  const [b, a] = [
    await page.locator('[data-snackbar-host] .snackbar').boundingBox(),
    await page.locator(selector).boundingBox()
  ];
  return b && a ? a.y - (b.y + b.height) : -1;
}

test('on the task screen a snackbar sits above בוצע / דחייה', async ({ page }) => {
  await openApp(page, '#/task/seed-ac');
  const detail = page.getByTestId('task-detail');
  await detail.getByRole('button', { name: 'דחייה' }).click();
  await page.locator('[data-snooze="tomorrow"]').click();
  await expect(page.locator('[data-snackbar-host] .snackbar')).toContainText('נדחתה למחר');
  await expect.poll(() => gapAbove(page, '[data-action-bar]')).toBeGreaterThanOrEqual(0);
});

test('undo by a finger tap on the snackbar throws nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openApp(page, '#/task/seed-dentist');
  const detail = page.getByTestId('task-detail');
  await detail.getByRole('button', { name: 'בוצע', exact: true }).click();
  await page.getByTestId('complete-sheet').getByRole('button', { name: 'סיום' }).click();
  const bar = page.locator('[data-snackbar-host] .snackbar');
  await expect(bar).toContainText('בוצע');
  await expect.poll(() => gapAbove(page, '[data-action-bar]')).toBeGreaterThanOrEqual(0);
  await bar.getByRole('button', { name: 'ביטול' }).tap();
  await expect.poll(async () => (await taskById(page, 'seed-dentist'))?.status).toBe('open');
  await expect(bar).toHaveCount(0);
  expect(errors).toEqual([]);
});
