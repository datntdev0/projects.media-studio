import { defineConfig, devices } from '@playwright/test';

const webBaseURL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const apiBaseURL = process.env.E2E_API_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // `list` so a run says what it did on the terminal and in CI's job summary;
  // `html` keeps the traces and screenshots behind that.
  reporter: [['list'], ['html']],
  // Above the 5s default: the app boots the Firebase SDK before its auth
  // middleware can redirect, and parallel specs share one Nuxt dev server.
  expect: { timeout: 15_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'web', testDir: './specs/web', use: { ...devices['Desktop Chrome'], baseURL: webBaseURL } },
    // No browser here — the API specs use the `request` fixture, which needs
    // nothing beyond a base URL.
    { name: 'api', testDir: './specs/api', use: { baseURL: apiBaseURL } },
  ],
});
