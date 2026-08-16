import { expect, test } from '@playwright/test';

// `/health` and `/system` sit outside the `/api/v1` prefix on purpose — see
// backend/src/core/api.constants.ts.

test('health reports the process is serving', async ({ request }) => {
  const response = await request.get('/health');

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(body.status).toBe('ok');
  expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  expect(['up', 'down']).toContain(body.firebaseStatus);
});

test('system identifies the build', async ({ request }) => {
  const response = await request.get('/system');

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(body.name).toBe('@media-studio/backend');
  expect(body.apiVersion).toBe('v1');
  expect(body.version).toEqual(expect.any(String));
  expect(body.environment).toEqual(expect.any(String));
});

test('the OpenAPI document is published', async ({ request }) => {
  const response = await request.get('/openapi.json');

  expect(response.status()).toBe(200);

  const document = await response.json();

  expect(document.info.title).toBe('Media Studio API');
  expect(Object.keys(document.paths)).toContain('/api/v1/library');
});
