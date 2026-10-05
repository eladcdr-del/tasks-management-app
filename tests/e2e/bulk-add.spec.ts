import type { Locator, Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// Quick add's list mode (feature bulk-add) on the demo seed at the fixed clock (Sunday 4 Oct 2026,
// 09:00, signed in as מיכל): pulse attention 3, waiting 3. "יום חמישי" = Thu 8 Oct.

interface TaskLite {
  id: string;
  title: string;
  ownerId: string | null;
  dueDate: string | null;
  priority: string;
}
interface Hooks {
  state: {
    tasks: { open: TaskLite[] };
    ui: { current: { message: string; action?: string } | null };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

/** A list as it comes out of a WhatsApp message: a heading, numbers, an emoji, a blank line. */
const WHATSAPP_LIST = [
  'דברים לעשות בבית 🏠:',
  '1. לתקן את הברז במטבח',
  '2. לקנות נורות לסלון',
  '3. להחליף מצבר באוטו',
  '4. לקבוע תור לרופא שיניים',
  '5. לשלם ארנונה עד יום חמישי',
  '6. לסדר את המחסן',
  '',
  '7. להזמין טכנאי למזגן דחוף',
  '8. לכבס וילונות',
  '9. להחזיר ספרים לספרייה',
  '10. לנקות את המרפסת 🧹',
  '11. להשקות עציצים כל שבוע',
  '12. לקנות מתנה ליום הולדת של סבתא'
].join('\n');

const TITLES = [
  'לתקן את הברז במטבח',
  'לקנות נורות לסלון',
  'להחליף מצבר באוטו',
  'לקבוע תור לרופא שיניים',
  'לשלם ארנונה',
  'לסדר את המחסן',
  'להזמין טכנאי למזגן',
  'לכבס וילונות',
  'להחזיר ספרים לספרייה',
  'לנקות את המרפסת 🧹',
  'להשקות עציצים',
  'לקנות מתנה ליום הולדת של סבתא'
];

const openTasks = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.open.map((t) => ({ ...t }))
  );
const snack = (page: Page) =>
  expect.poll(() =>
    page.evaluate(
      () => (window as unknown as HookWindow).__homecareTest.state.ui.current?.message ?? ''
    )
  );
const rows = (list: Locator) => list.locator('[data-row]');

/** Pastes `text` into `field` the way the browser does (a paste event carrying the clipboard). */
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

test('paste a WhatsApp list: it becomes a list, drop one, add 11, and Home shows them', async ({
  page
}) => {
  await openApp(page);
  await expect(page.locator('[data-pulse="waiting"]')).toHaveText('3');
  await page.locator('[data-fab]').click();
  const single = page.getByTestId('quick-add');
  await paste(single.getByLabel('מה צריך לעשות?'), WHATSAPP_LIST);

  // The paste turned into the list mode, with a line saying so.
  const sheet = page.getByTestId('quick-add-list');
  await expect(sheet).toBeVisible();
  await expect(single).toBeHidden();
  await expect(sheet.getByRole('heading', { name: 'כמה משימות בבת אחת' })).toBeVisible();
  await expect(sheet.getByText('הדבקת רשימה, אז כל שורה תהיה משימה נפרדת')).toBeVisible();
  await expect(sheet.getByLabel('רשימת המשימות')).toHaveValue(WHATSAPP_LIST);

  // One row per task: the heading is skipped, numbers go, the parsed phrases become chips.
  const list = sheet.getByRole('list', { name: 'המשימות שיתווספו' });
  await expect(rows(list)).toHaveCount(12);
  await expect(list.locator('.row-title')).toHaveText(TITLES);
  const tax = rows(list).filter({ hasText: 'לשלם ארנונה' });
  await expect(tax.locator('[data-key^="due:"]')).toHaveText('עד יום ה׳ 8/10');
  const ac = rows(list).filter({ hasText: 'להזמין טכנאי למזגן' });
  await expect(ac.locator('[data-key^="priority:"]')).toHaveText('דחוף');
  const add = sheet.locator('[data-list-add]');
  await expect(add).toHaveText('הוספת 12 משימות');
  await page.waitForTimeout(300);
  await shot(page, 'bulk-add-preview');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await shot(page, 'bulk-add-preview-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // Drop one line: it leaves the box and the preview.
  await sheet.getByRole('button', { name: 'הסרה מהרשימה: לכבס וילונות' }).click();
  await expect(rows(list)).toHaveCount(11);
  await expect(sheet.getByLabel('רשימת המשימות')).not.toHaveValue(/לכבס וילונות/);
  await expect(add).toHaveText('הוספת 11 משימות');

  const before = new Set((await openTasks(page)).map((t) => t.id));
  await add.click();
  await expect(sheet).toHaveCount(0);
  await snack(page).toBe('נוספו 11 משימות');
  await expect(page.getByText('נוספו 11 משימות')).toBeVisible();

  // All of them, nobody's yet: they wait for someone to take them (the urgent one needs attention).
  const added = (await openTasks(page)).filter((t) => !before.has(t.id));
  expect(added.map((t) => t.title).sort()).toEqual(
    TITLES.filter((t) => t !== 'לכבס וילונות').sort()
  );
  expect(added.every((t) => t.ownerId === null)).toBe(true);
  expect(added.find((t) => t.title === 'לשלם ארנונה')).toMatchObject({ dueDate: '2026-10-08' });
  await expect(page.locator('[data-pulse="waiting"]')).toHaveText('13');
  await expect(page.locator('[data-pulse="attention"]')).toHaveText('4');
  // Home shows what nobody has taken yet ("הכל" + "פנויות"): every new one is listed, even inside a
  // folded category group (the urgent one sits in "דורש תשומת לב").
  await expect(page.getByRole('radio', { name: /הכל/ })).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('group', { name: 'של מי' }).getByRole('button', { name: 'פנויות' })
  ).toHaveAttribute('aria-pressed', 'true');
  const plan = page.locator('[data-section="plan"]');
  for (const t of added.filter((x) => x.priority !== 'urgent')) {
    await expect(plan.locator(`[data-task-id="${t.id}"]`)).toHaveCount(1);
  }
  // Home scrolled down to them.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const first = added.find((t) => t.title === 'לשלם ארנונה')!;
  await expect(plan.locator(`[data-task-id="${first.id}"]`)).toBeInViewport();
  await page.waitForTimeout(400);
  await shot(page, 'bulk-add-home');
});

test('type a list after the link, undo takes it all back', async ({ page }) => {
  await openApp(page, '#/new');
  const single = page.getByTestId('quick-add');
  await single.getByLabel('מה צריך לעשות?').fill('לקנות חלב');
  await single.getByRole('button', { name: 'הוספת כמה משימות בבת אחת' }).click();

  const sheet = page.getByTestId('quick-add-list');
  const box = sheet.getByLabel('רשימת המשימות');
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('לקנות חלב');
  await expect(
    sheet.getByText('משימה בכל שורה. אפשר להדביק רשימה מוואטסאפ או מהפתקים')
  ).toBeVisible();
  await expect(sheet.locator('[data-list-add]')).toHaveText('הוספת משימה אחת');

  // Back and forth keeps the list.
  await sheet.getByRole('button', { name: 'חזרה למשימה אחת' }).click();
  await expect(single.getByLabel('מה צריך לעשות?')).toBeFocused();
  await expect(single.getByLabel('מה צריך לעשות?')).toHaveValue('');
  await single.getByRole('button', { name: 'הוספת כמה משימות בבת אחת' }).click();
  await expect(box).toHaveValue('לקנות חלב');

  await box.press('End');
  await box.pressSequentially('\n☐ לתקן מדף בחדר של נועה\n☐ להחזיר מכנסיים עד יום חמישי');
  const list = sheet.getByRole('list', { name: 'המשימות שיתווספו' });
  await expect(list.locator('.row-title')).toHaveText([
    'לקנות חלב',
    'לתקן מדף בחדר של נועה',
    'להחזיר מכנסיים'
  ]);
  await expect(rows(list).nth(2).locator('[data-key^="due:"]')).toHaveAttribute(
    'data-hard',
    'true'
  );
  const before = new Set((await openTasks(page)).map((t) => t.id));
  const added = async () =>
    (await openTasks(page))
      .filter((t) => !before.has(t.id))
      .map((t) => t.title)
      .sort();
  await sheet.locator('[data-list-add]').click();
  await snack(page).toBe('נוספו 3 משימות');
  await expect.poll(added).toEqual(['לקנות חלב', 'לתקן מדף בחדר של נועה', 'להחזיר מכנסיים'].sort());

  // "ביטול" on the snackbar takes the whole list back.
  await page.getByRole('button', { name: 'ביטול' }).click();
  await expect.poll(added).toEqual([]);
});

test('an empty list mode, light and dark', async ({ page }) => {
  await openApp(page, '#/new');
  await page.getByRole('button', { name: 'הוספת כמה משימות בבת אחת' }).click();
  const sheet = page.getByTestId('quick-add-list');
  await expect(sheet.locator('[data-list-add]')).toBeDisabled();
  await expect(sheet.locator('[data-list-add]')).toHaveText('הוספת משימות');
  await page.waitForTimeout(400);
  await shot(page, 'bulk-add-empty');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await shot(page, 'bulk-add-empty-dark');
});
