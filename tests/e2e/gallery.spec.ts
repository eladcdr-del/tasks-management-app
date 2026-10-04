import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Design-system gallery (step 1.4): screenshots in light + dark, no console errors, axe clean
// (0 serious/critical), and the interactive contracts of BottomSheet, Dialog, SegmentedControl,
// CompletionCircle (+ haptics) and Snackbar.

const GALLERY = './?demo=1#/dev/gallery'; // relative: keeps the /tasks-management-app/ base
const SCREENS = 'tests/e2e/__screens__';

/** Collects page errors and console errors. The browser's own /favicon.ico probe is ignored
 *  (the app has no favicon until step 5.1 adds the icon set). */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location().url ?? '';
    if (/\/favicon\.ico$/.test(url)) return;
    errors.push(`console: ${m.text()} (${url})`);
  });
  return errors;
}

async function openGallery(page: Page): Promise<void> {
  await page.goto(GALLERY);
  await expect(page.getByRole('heading', { level: 1, name: 'גלריית רכיבים' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`gallery: ${colorScheme} screenshots, no console errors, axe clean`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.emulateMedia({ colorScheme });
    await openGallery(page);

    // The theme follows the system by default; check the dark tokens really apply.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(colorScheme === 'dark' ? 'rgb(28, 23, 20)' : 'rgb(251, 246, 239)');

    // Full page at CSS scale: at DPR 2 the ~9k px page would exceed Chromium's capture limit.
    await page.screenshot({
      path: `${SCREENS}/gallery-${colorScheme}.png`,
      fullPage: true,
      scale: 'css',
      animations: 'disabled'
    });

    const axe = await new AxeBuilder({ page }).analyze();
    const serious = axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    expect(serious, serious.join('\n')).toEqual([]);

    // An open bottom sheet over the page (viewport, device scale).
    await page.getByRole('button', { name: 'פתיחת גיליון', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'דחייה' });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(900); // let the spring settle
    await page.screenshot({
      path: `${SCREENS}/gallery-sheet-${colorScheme}.png`,
      animations: 'disabled'
    });

    const axeSheet = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    const seriousSheet = axeSheet.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(seriousSheet.map((v) => v.id)).toEqual([]);

    expect(errors).toEqual([]);
  });
}

test('BottomSheet: modal, focus trapped, Escape closes and restores focus, drag dismisses', async ({
  page
}) => {
  const errors = trackErrors(page);
  await openGallery(page);
  const opener = page.getByRole('button', { name: 'פתיחת גיליון', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');

  const sheet = page.getByRole('dialog', { name: 'דחייה' });
  await expect(sheet).toBeVisible();
  // Native modal: everything behind it is inert.
  expect(await sheet.evaluate((d) => d.matches(':modal'))).toBe(true);
  // Focus moved inside, and Tab / Shift+Tab never leave the sheet.
  const focusInside = () => page.evaluate(() => !!document.activeElement?.closest('dialog[open]'));
  expect(await focusInside()).toBe(true);
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInside()).toBe(true);
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await focusInside()).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
  // Page scroll is released.
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');

  // Drag the handle down quickly → dismiss.
  await opener.tap();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(900);
  const handle = sheet.locator('.grab');
  const box = await handle.boundingBox();
  if (!box) throw new Error('no handle');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + i * 50);
  await page.mouse.up();
  await expect(sheet).toBeHidden();

  // A short drag springs back instead of closing.
  await opener.tap();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(900);
  const top0 = (await sheet.locator('.panel').boundingBox())?.y ?? 0;
  const box2 = await handle.boundingBox();
  if (!box2) throw new Error('no handle');
  await page.mouse.move(box2.x + 20, box2.y + 5);
  await page.mouse.down();
  await page.mouse.move(box2.x + 20, box2.y + 25, { steps: 8 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(900);
  await expect(sheet).toBeVisible();
  const top1 = (await sheet.locator('.panel').boundingBox())?.y ?? 0;
  expect(Math.abs(top1 - top0)).toBeLessThan(3);
  await sheet.locator('.head').getByRole('button', { name: 'סגירה' }).click();
  await expect(sheet).toBeHidden();

  expect(errors).toEqual([]);
});

test('BottomSheet with snap points keeps its footer on screen and autofocuses', async ({
  page
}) => {
  await openGallery(page);
  await page.getByRole('button', { name: 'גיליון עם נקודות עצירה' }).tap();
  const sheet = page.getByRole('dialog', { name: 'משימה חדשה' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(900);
  await expect(sheet.getByRole('textbox', { name: 'כותרת המשימה' })).toBeFocused();
  await expect(sheet.getByRole('button', { name: 'הוספה' })).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('Dialog: focus starts on cancel, Escape cancels', async ({ page }) => {
  await openGallery(page);
  await page.getByRole('button', { name: 'דיאלוג אישור' }).tap();
  const dialog = page.getByRole('alertdialog', { name: 'למחוק את המשימה?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'ביטול' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('SegmentedControl: arrow keys follow the RTL reading direction', async ({ page }) => {
  await openGallery(page);
  const group = page.locator('[data-section="segmented"]').getByRole('radiogroup');
  const today = group.getByRole('radio', { name: 'היום' });
  const week = group.getByRole('radio', { name: 'השבוע' });
  await today.click();
  await expect(today).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowLeft'); // RTL: left = next
  await expect(week).toHaveAttribute('aria-checked', 'true');
  await expect(week).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(today).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('End');
  await expect(group.getByRole('radio', { name: 'בהמשך' })).toHaveAttribute('aria-checked', 'true');
});

test('CompletionCircle: draws the check, fires the "complete" haptic, crossfades under reduced motion', async ({
  page
}) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __vibrations: unknown[] }).__vibrations = calls;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (p: unknown) => {
        calls.push(p);
        return true;
      }
    });
  });
  await openGallery(page);
  const circle = page.getByRole('checkbox', { name: 'סימון כבוצעה: להחליף נורה במטבח' });
  await expect(circle).toHaveAttribute('aria-checked', 'false');
  const check = circle.locator('.check');
  expect(await check.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain(
    'stroke-dashoffset'
  );

  await circle.tap();
  await expect(circle).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(() => check.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset)))
    .toBe(0);
  const vib = await page.evaluate(
    () => (window as unknown as { __vibrations: unknown[] }).__vibrations
  );
  expect(vib).toContainEqual([10, 40, 18]);

  // Reduced motion: no stroke drawing, a short opacity crossfade instead.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const style = await check.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { prop: cs.transitionProperty, dur: cs.transitionDuration };
  });
  expect(style.prop).toBe('opacity');
  expect(parseFloat(style.dur)).toBeLessThanOrEqual(0.12);
});

test('Snackbar: auto-dismisses after 5s, pauses while touched', async ({ page }) => {
  await openGallery(page);
  await page.clock.install();
  const host = page.locator('.snack-host');

  await page.getByRole('button', { name: 'הצגת הודעה' }).click();
  await expect(host.getByText('בוצע', { exact: true })).toBeVisible();
  await page.clock.runFor(4000);
  await expect(host.getByText('בוצע', { exact: true })).toBeVisible();
  await page.clock.runFor(1500);
  await expect(host.getByText('בוצע', { exact: true })).toBeHidden();

  // Touch and hold → paused well past 5s; release → resumes and dismisses.
  await page.getByRole('button', { name: 'הצגת הודעה' }).click();
  const bar = host.locator('.snackbar');
  await expect(bar).toBeVisible();
  await page.clock.runFor(2000); // ~3s left
  await bar.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.clock.runFor(8000);
  await expect(bar).toBeVisible();
  await bar.dispatchEvent('pointerup', { pointerType: 'touch' });
  await page.clock.runFor(2000);
  await expect(bar).toBeVisible(); // resumed with the ~3s that were left
  await page.clock.runFor(1600);
  await expect(bar).toBeHidden();
});

test('focus ring: every :focus-visible outline uses --focus-ring (never the 2.9:1 accent)', async ({
  page
}) => {
  await openGallery(page);
  const ring = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--focus-ring)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  // Keyboard focus on a sample of primitives; the visible outline (on the element or the inner
  // face / dot / pseudo-element) must carry the focus-ring colour.
  const targets = [
    page.getByRole('button', { name: 'פתיחת גיליון', exact: true }),
    page.locator('[data-section="chips"] button.chip').first(),
    page.getByRole('radio', { name: 'מרווה' }),
    page.locator('[data-section="sheet-parts"] .picker-chip .main').first(),
    page.locator('[data-section="sheet-parts"] [aria-expanded]').first()
  ];
  for (const target of targets) {
    await target.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const colors = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const nodes = [el, el.parentElement!, ...el.querySelectorAll('*')];
      const out: string[] = [];
      for (const n of nodes) {
        for (const pseudo of [null, '::after', '::before']) {
          const cs = getComputedStyle(n, pseudo);
          if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0)
            out.push(cs.outlineColor);
        }
        const sib = n.nextElementSibling;
        if (n === el && sib) {
          const cs = getComputedStyle(sib);
          if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0)
            out.push(cs.outlineColor);
        }
      }
      return out;
    });
    expect(colors.length, 'a visible focus outline').toBeGreaterThan(0);
    for (const c of colors) expect(c).toBe(ring);
  }
});

test('large text (200%): no horizontal overflow at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openGallery(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.waitForTimeout(100);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
