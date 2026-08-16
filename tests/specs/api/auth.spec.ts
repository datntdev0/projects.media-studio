import { expect, test } from '@playwright/test';

test('the library refuses a request carrying no token', async ({ request }) => {
  const response = await request.get('/api/v1/library');

  expect(response.status()).toBe(401);
});

test('the library refuses a token it cannot verify', async ({ request }) => {
  const response = await request.get('/api/v1/library', { headers: { authorization: 'Bearer not-a-token' } });

  expect(response.status()).toBe(401);
});

test('an unknown route is a 404', async ({ request }) => {
  const response = await request.get('/api/v1/nothing-here');

  expect(response.status()).toBe(404);
});
