import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

interface ScraperConfig {
  baseUrl: string;
}

interface LlmConfig {
  codexModel: string;
  claudeModel: string;
}

export interface AppConfig {
  /** Base dir (see getAppBaseDir()) for the app's own runtime data (db, logs, covers, ...), relative to the project root in dev or the exe's dir when packaged. */
  appDir: string;
  scraper: ScraperConfig;
  llm: LlmConfig;
}

const DEFAULT_CONFIG: AppConfig = {
  appDir: '.',
  scraper: { baseUrl: 'http://127.0.0.1:8000' },
  llm: { codexModel: 'gpt-5.5', claudeModel: 'claude-sonnet-5' },
};

/** Plain JSON isn't bundled into main.js by Vite — it ships as a packaged extraResource instead (see forge.config.ts), the same way migration SQL does. */
function getConfigPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(app.getAppPath(), 'config.json');
}

interface PartialAppConfig {
  appDir?: string;
  scraper?: Partial<ScraperConfig>;
  llm?: Partial<LlmConfig>;
}

function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as PartialAppConfig;
  return {
    appDir: parsed.appDir ?? DEFAULT_CONFIG.appDir,
    scraper: { ...DEFAULT_CONFIG.scraper, ...parsed.scraper },
    llm: { ...DEFAULT_CONFIG.llm, ...parsed.llm },
  };
}

export const config: AppConfig = loadConfig();
