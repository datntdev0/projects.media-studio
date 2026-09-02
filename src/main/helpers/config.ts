import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { LlmEngine, type LlmOptions, type LlmSettings } from '@/shared/llm';

export interface LlmConfig {
  /** The models each engine offers, in the order a picker shows them. Which engine to use is the user's, not the config's. */
  models: Record<string, string[]>;
  timeoutMs: number;
}

export interface AppConfig {
  appDir: string;
  llm: LlmConfig;
}

const DEFAULT_CONFIG: AppConfig = {
  appDir: '.',
  llm: {
    models: {
      [LlmEngine.Claude]: ['claude-opus-5', 'claude-sonnet-5'],
      [LlmEngine.Codex]: ['gpt-5.5'],
    },
    timeoutMs: 300_000,
  },
};

/** Plain JSON isn't bundled into main.js by Vite — it ships as a packaged extraResource instead (see forge.config.ts), the same way migration SQL does. */
function getConfigPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(app.getAppPath(), 'config.json');
}

interface PartialAppConfig {
  appDir?: string;
  llm?: Partial<LlmConfig>;
}

function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as PartialAppConfig;
  return {
    appDir: parsed.appDir ?? DEFAULT_CONFIG.appDir,
    llm: { ...DEFAULT_CONFIG.llm, ...parsed.llm },
  };
}

export const config: AppConfig = loadConfig();

/** The engines a picker may offer — only those config.json actually gives models for. */
export function llmOptions(): LlmOptions {
  const models = config.llm.models;
  return { engines: Object.values(LlmEngine).filter((engine) => (models[engine]?.length ?? 0) > 0), models };
}

/**
 * The settings a step will actually call with, or null when there is nothing to
 * call: config.json names no engine, so a workspace that has not picked one has
 * no LLM at all. A picked engine config.json no longer offers models for counts
 * as unpicked; a picked model it no longer lists is kept, since that is what the
 * chapters already extracted were extracted with.
 */
export function resolveLlmSettings(chosen: LlmSettings | null): LlmSettings | null {
  const models = chosen && config.llm.models[chosen.engine];
  if (!chosen || !models || models.length === 0) return null;
  return { engine: chosen.engine, model: chosen.model || models[0] };
}
