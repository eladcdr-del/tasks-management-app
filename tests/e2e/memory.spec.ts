import { expect, openApp, shot, test } from './fixtures';

// House memory (#/memory, step 3.3): Hebrew search over the documentation, filters, month groups.
// Seed (relative to the fixed Sunday 4 Oct 2026): "החלפת מצבר" was done by דני ~60 days ago at
// "מוסך השרון, כפר סבא" for 650 ₪, with a photo of the receipt.

test('search finds the battery replacement with its garage and cost', async ({ page }) => {
  await openApp(page, '#/memory');
  const memory = page.getByTestId('memory');
  await expect(memory.getByRole('heading', { level: 1, name: 'זיכרון הבית' })).toBeVisible();

  // Month headers, newest first.
  const months = memory.locator('.month-title');
  await expect(months.first()).toHaveText(/^[א-ת]+ \d{4}$/);
  expect(await months.count()).toBeGreaterThanOrEqual(3);
  await expect(memory.locator('[data-month="2026-08"] .month-title')).toHaveText('אוגוסט 2026');
  await shot(page, 'memory');

  const search = memory.getByRole('searchbox', { name: 'חיפוש בזיכרון הבית' });
  await expect(search).toHaveAttribute('placeholder', 'מתי החלפנו מצבר?');
  await search.fill('מצבר');
  const card = memory.getByTestId('memory-card').filter({ hasText: 'החלפת מצבר' });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('מוסך השרון');
  await expect(card).toContainText('650');
  await expect(card).toContainText('דני');
  await expect(card.locator('[data-photo-id] img')).toBeVisible();
  await expect(memory.getByTestId('memory-card')).toHaveCount(1);

  await search.fill('מתי החלפנו מצבר ובאיזה מוסך?');
  await expect(memory.getByTestId('memory-card').first()).toContainText('החלפת מצבר');
  await shot(page, 'memory-search');

  // A search with no match offers to clear it (no word about a filter nobody set).
  await search.fill('טלסקופ');
  const empty = memory.locator('.empty');
  await expect(empty.getByRole('heading', { name: 'לא מצאנו' })).toBeVisible();
  await expect(empty).toContainText('נסו לחפש במילה אחרת.');
  await expect(empty).not.toContainText('סינון');
  await empty.getByRole('button', { name: 'ניקוי החיפוש' }).click();
  await expect(search).toHaveValue('');

  // Tap → the task detail with its documentation.
  await search.fill('מצבר');
  await card.click();
  await expect(page).toHaveURL(/#\/task\/seed-battery$/);
  await expect(page.getByTestId('documentation')).toContainText('יוסי');
});

test('category and member filters narrow the memory', async ({ page }) => {
  await openApp(page, '#/memory');
  const memory = page.getByTestId('memory');
  const cards = memory.getByTestId('memory-card');
  await expect(cards.first()).toBeVisible();
  const all = await cards.count();

  await memory.locator(`button[data-category="car"]`).click();
  await expect(memory.locator(`button[data-category="car"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.filter({ hasText: 'החלפת מצבר' })).toHaveCount(1);
  await expect(cards.filter({ hasText: 'הדברה בבית' })).toHaveCount(0);
  const cars = await cards.count();
  expect(cars).toBeLessThan(all);
  await expect(memory.getByRole('status')).toContainText(String(cars));

  // Member filter on top: only what מיכל did with the car (the battery was דני's).
  await memory.locator(`button[data-member="michal"]`).click();
  await expect(cards.filter({ hasText: 'החלפת מצבר' })).toHaveCount(0);
  await memory.locator(`button[data-member="michal"]`).click();
  await memory.locator(`button[data-category="car"]`).click();
  await expect(cards).toHaveCount(all);

  // A word and a chip with no match: the copy names both, and the button drops the chip only.
  await memory.locator(`button[data-category="car"]`).click();
  const search = memory.getByRole('searchbox', { name: 'חיפוש בזיכרון הבית' });
  await search.fill('הדברה');
  const empty = memory.locator('.empty');
  await expect(empty).toContainText('נסו מילה אחרת, או בטלו את הסינון.');
  await empty.getByRole('button', { name: 'ביטול הסינון' }).click();
  await expect(memory.locator(`button[data-category="car"]`)).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await expect(search).toHaveValue('הדברה');
  await expect(cards.filter({ hasText: 'הדברה בבית' })).toHaveCount(1);
});
