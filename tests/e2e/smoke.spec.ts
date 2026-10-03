import { expect, test } from '@playwright/test';

// Shell smoke test (step 1.1). Deliberately generic so it stays green as later steps replace the
// placeholder screens and add boot gating: whatever the first screen is, it must be a Hebrew RTL
// page under the base path, on the cream background, rendered in Rubik.

test('boots as a Hebrew RTL shell under /tasks-management-app/ with Rubik loaded', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Relative URL: keeps the /tasks-management-app/ base path from playwright.config baseURL.
  const response = await page.goto('./');
  expect(response?.ok()).toBe(true);
  expect(new URL(page.url()).pathname).toBe('/tasks-management-app/');

  const html = page.locator('html');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(html).toHaveAttribute('lang', 'he');

  // A visible Hebrew title.
  const title = page.locator('h1').first();
  await expect(title).toBeVisible();
  await expect(title).toHaveText(/[֐-׿]/);

  // Rubik Variable is actually loaded (not just declared) and used for the title.
  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].filter(
      (f) => f.family.replace(/["']/g, '') === 'Rubik Variable'
    );
    const h1 = document.querySelector('h1');
    return {
      loaded: faces.filter((f) => f.status === 'loaded').length,
      checkHebrew: document.fonts.check('16px "Rubik Variable"', 'שלום'),
      family: h1 ? getComputedStyle(h1).fontFamily : ''
    };
  });
  expect(font.loaded).toBeGreaterThan(0);
  expect(font.checkHebrew).toBe(true);
  expect(font.family).toMatch(/^["']?Rubik Variable/);

  // Cream page background from tokens.css (light theme).
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(251, 246, 239)');

  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('shell.png') });
});
