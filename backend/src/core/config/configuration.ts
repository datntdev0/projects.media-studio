import { registerAs } from '@nestjs/config';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/** Nest's log levels, least to most severe. Enabling one enables everything above it. */
export const LOG_LEVELS = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
] as const;

export type LogLevelName = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  logLevel: LogLevelName;
  /** Serve Swagger UI and the OpenAPI document. */
  docsEnabled: boolean;
}

const DEFAULT_PORT = 3001;
const DEFAULT_LOG_LEVEL: LogLevelName = 'log';

/**
 * Lifts the environment into a typed object, with a default for each setting.
 *
 * Reading only — nothing here checks a value, so a typo in `LOG_LEVEL` or a
 * non-numeric `PORT` falls back to the default rather than stopping the
 * process. Exported for its spec; the app goes through `appConfig`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: (env.NODE_ENV as NodeEnv | undefined) ?? NodeEnv.Development,
    // `Number('')` and `Number('abc')` are 0 and NaN, both falsy, so a missing
    // or unusable value lands on the default.
    port: Number(env.PORT) || DEFAULT_PORT,
    logLevel: (env.LOG_LEVEL as LogLevelName | undefined) ?? DEFAULT_LOG_LEVEL,
    // `Boolean('false')` is `true`, so the flag is read rather than cast.
    docsEnabled: env.API_DOCS_ENABLED !== 'false',
  };
}

export const CONFIG_NAMESPACE = 'app';

/** The single place `process.env` is read. */
export const appConfig = registerAs(CONFIG_NAMESPACE, () => loadConfig());
