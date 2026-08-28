import { test, expect } from './fixtures';
import { createManualNovel, createWorkflow } from './helpers';

test('create: a new workflow appears in the workflow list', async ({ page }) => {
  const libraryTitle = `E2E Workflow Library ${Date.now()}`;
  const workflowName = `E2E Create Workflow ${Date.now()}`;
  await createManualNovel(page, libraryTitle);

  await createWorkflow(page, workflowName, libraryTitle);

  await expect(page.getByRole('row', { name: workflowName })).toBeVisible();
});

test('update: editing a workflow renames it in the workflow list', async ({ page }) => {
  const libraryTitle = `E2E Workflow Library ${Date.now()}`;
  const workflowName = `E2E Update Workflow ${Date.now()}`;
  const renamedName = `${workflowName} (renamed)`;
  await createManualNovel(page, libraryTitle);
  await createWorkflow(page, workflowName, libraryTitle);

  const row = page.getByRole('row', { name: workflowName });
  await row.getByRole('button', { name: 'Actions' }).click();
  await row.getByRole('button', { name: 'Edit' }).click();

  const nameInput = page.locator('.field', { hasText: 'Name' }).locator('input');
  await nameInput.fill(renamedName);
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('row', { name: renamedName })).toBeVisible();
  await expect(page.getByText(workflowName, { exact: true })).toHaveCount(0);
});

test('delete: removing a workflow takes it out of the workflow list', async ({ page }) => {
  const libraryTitle = `E2E Workflow Library ${Date.now()}`;
  const workflowName = `E2E Delete Workflow ${Date.now()}`;
  await createManualNovel(page, libraryTitle);
  await createWorkflow(page, workflowName, libraryTitle);

  const row = page.getByRole('row', { name: workflowName });
  await row.getByRole('button', { name: 'Actions' }).click();
  await row.getByRole('button', { name: 'Delete' }).click();

  const confirmDialog = page.locator('.dialog', { hasText: 'Delete workflow' });
  await confirmDialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText(workflowName, { exact: true })).toHaveCount(0);
});
