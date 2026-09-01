import type { Page } from '@playwright/test';

export async function openScreen(page: Page, label: 'Dashboard' | 'Library' | 'Settings') {
  await page.getByRole('button', { name: label, exact: true }).click();
}

// Describing an item by hand needs no package to import, so it's the creation
// mode an e2e run can exercise with no fixture file on disk.
export async function createManualNovel(page: Page, title: string, author = 'Jane Doe', language = 'en') {
  await openScreen(page, 'Library');
  await page.getByRole('button', { name: 'New item' }).click();

  await page.locator('label.blueprint', { hasText: 'Manually' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.locator('.field', { hasText: 'Title' }).locator('input').fill(title);
  await page.locator('.field', { hasText: 'Author' }).locator('input').fill(author);
  await page.locator('.field', { hasText: 'Language' }).locator('input').fill(language);

  await page.getByRole('button', { name: 'Create item' }).click();
}
