import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test';

// `npm run package` builds .vite/build/main.js via Forge's Vite plugin
// (which injects the MAIN_WINDOW_VITE_* globals main.js needs), launched
// unpacked with the plain electron binary so the production security fuses
// (which block the --inspect flag Playwright's electron support relies on)
// never apply. Point Electron at the project root (not main.js directly) so
// it resolves package.json's "main" field itself — that's what makes
// app.getAppPath() resolve to the project root, matching dev/packaged
// behavior (see src/main/database/migrate.ts's unpackaged path).
const PROJECT_ROOT = path.join(__dirname, '..');
const MAIN_ENTRY = path.join(PROJECT_ROOT, '.vite', 'build', 'main.js');

// Kept under the project root (not the OS temp dir) so runs are easy to find and inspect — see e2e/.data/.gitignore.
const DATA_ROOT = path.join(__dirname, '.data');

interface Fixtures {
  electronApp: ElectronApplication;
  page: Page;
}

/** Each test gets its own disposable data dir (db, covers, ...) under e2e/.data/ via `APP_DATA_DIR` — see src/main/helpers/paths.ts. */
export const test = base.extend<Fixtures>({
  electronApp: async ({}, use, testInfo) => {
    if (!fs.existsSync(MAIN_ENTRY)) throw new Error(`Missing ${MAIN_ENTRY} — run "npm run package" before the e2e suite.`);

    const dataDir = path.join(DATA_ROOT, testInfo.testId);
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.mkdirSync(dataDir, { recursive: true });

    const app = await electron.launch({
      args: [PROJECT_ROOT],
      env: { ...process.env, APP_DATA_DIR: dataDir },
    });

    await use(app);

    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect };
