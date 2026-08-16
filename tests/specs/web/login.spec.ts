import { expect, test } from '@playwright/test';

test('a signed-out visitor lands on sign in', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('a protected route is remembered across the bounce', async ({ page }) => {
  await page.goto('/library');

  await expect(page).toHaveURL('/auth/login?redirect=/library');
});

test('the form asks for both fields before it submits', async ({ page }) => {
  await page.goto('/auth/login');

  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Enter your email address.')).toBeVisible();
  await expect(page.getByText('Enter your password.')).toBeVisible();
});

test('the password can be revealed', async ({ page }) => {
  await page.goto('/auth/login');

  // By role, not by label: the reveal button carries a "Show password" label
  // that `getByLabel('Password')` matches too.
  const password = page.getByRole('textbox', { name: 'Password' });
  await password.fill('StrongPassword123!');
  await expect(password).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: 'Show password' }).click();

  await expect(password).toHaveAttribute('type', 'text');
});
