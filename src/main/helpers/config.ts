import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  /** Base dir (see getAppBaseDir()) for the app's own runtime data (db, logs, covers, ...), relative to the project root in dev or the exe's dir when packaged. */
  appDir: string;
}

const DEFAULT_CONFIG: AppConfig = {
  appDir: '.',
};

/** Plain JSON isn't bundled into main.js by Vite — it ships as a packaged extraResource instead (see forge.config.ts), the same way migration SQL does. */
function getConfigPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(app.getAppPath(), 'config.json');
}

function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<AppConfig>;
  return { appDir: parsed.appDir ?? DEFAULT_CONFIG.appDir };
}

export const config: AppConfig = loadConfig();
