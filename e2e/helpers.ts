import type { Page } from '@playwright/test';

export async function openScreen(page: Page, label: 'Dashboard' | 'Workflow' | 'Library' | 'Scrapings' | 'Settings') {
  await page.getByRole('button', { name: label, exact: true }).click();
}

// Manual source mode needs no crawler/worker — it's the only source mode an
// e2e run can exercise without the Python scraping worker running.
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

// A workflow always belongs to a library, so tests build one first via `createManualNovel`.
export async function createWorkflow(page: Page, name: string, libraryTitle: string) {
  await openScreen(page, 'Workflow');
  await page.getByRole('button', { name: 'New workflow' }).click();

  await page.locator('.field', { hasText: 'Name' }).locator('input').fill(name);
  await page.locator('.blueprint', { hasText: libraryTitle }).click();

  await page.getByRole('button', { name: 'Create workflow' }).click();
}
