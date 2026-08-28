import { test, expect } from './fixtures';
import { createManualNovel } from './helpers';

test('create: a manual novel item appears in the library list', async ({ page }) => {
  const title = `E2E Create Novel ${Date.now()}`;

  await createManualNovel(page, title);

  await expect(page.getByRole('row', { name: title })).toBeVisible();
});

test('update: editing an item renames it in the library list', async ({ page }) => {
  const title = `E2E Update Novel ${Date.now()}`;
  const renamedTitle = `${title} (renamed)`;
  await createManualNovel(page, title);

  const row = page.getByRole('row', { name: title });
  await row.getByRole('button', { name: 'Actions' }).click();
  await row.getByRole('button', { name: 'Edit' }).click();

  const titleInput = page.locator('.field', { hasText: 'Title' }).locator('input');
  await titleInput.fill(renamedTitle);
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('row', { name: renamedTitle })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});

test('delete: removing an item takes it out of the library list', async ({ page }) => {
  const title = `E2E Delete Novel ${Date.now()}`;
  await createManualNovel(page, title);

  const row = page.getByRole('row', { name: title });
  await row.getByRole('button', { name: 'Actions' }).click();
  await row.getByRole('button', { name: 'Delete' }).click();

  const confirmDialog = page.locator('.dialog', { hasText: 'Delete library item' });
  await confirmDialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});
