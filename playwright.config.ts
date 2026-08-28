import { defineConfig } from '@playwright/test';

// Runs against the packaged app (see e2e/fixtures.ts) — `npm run test:e2e`
// packages it first via the `pretest:e2e` script.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
});
