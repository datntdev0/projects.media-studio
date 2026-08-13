import { registerAs } from '@nestjs/config';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/** Nest's log levels, least to most severe. Enabling one enables everything above it. */
export const LOG_LEVELS = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'] as const;

export type LogLevelName = (typeof LOG_LEVELS)[number];

/**
 * Where the local emulator suite is, one host per service. Empty means the real
 * Firebase — and the two are set independently, because a service is emulated or
 * it is not, regardless of what its neighbour does.
 */
export interface FirebaseEmulatorConfig {
  /** `host:port` of the Authentication emulator. Set locally, empty everywhere else. */
  authenticationHost: string;
  /** `host:port` of the Firestore emulator. Set locally, empty everywhere else. */
  firestoreHost: string;
  /** `host:port` of the Storage emulator. Set locally, empty everywhere else. */
  storageHost: string;
}

export interface FirebaseConfig {
  /** The `demo-` prefix marks an emulator-only project, and fails loudly against the real API. */
  projectId: string;
  /** The web API key. Used to check a password before changing it — see IdentityToolkitClient. */
  apiKey: string;
  /** A service account, as inline JSON. Empty falls back to application default credentials. */
  serviceAccountJson: string;
  /** The bucket cached files are written to — the one the browser already uploads covers to. */
  storageBucket: string;
  emulators: FirebaseEmulatorConfig;
}

/** Where the scraping service is, and how long it is given to answer. */
export interface ScrapingConfig {
  /** Root of the FastAPI service — see `scraping/README.md`. */
  baseUrl: string;
  /**
   * How long one call may take. Generous on purpose: the service drives a real
   * browser, and a first fetch that has to solve a Cloudflare turnstile is slow
   * in a way an ordinary API is not.
   */
  timeoutMs: number;
  /** How long a scraped answer stays good once cached. */
  cacheTtlDays: number;
}

/** Where Redis is, and how a job behaves once it is on a queue. */
export interface QueueConfig {
  host: string;
  port: number;
  /** Empty for a local Redis, which asks for nothing. */
  password: string;
  /** Prefixes every key, so two deployments can share one Redis without meeting. */
  prefix: string;
  /** How many times a job is tried before it is left in the failed set. */
  attempts: number;
  /** The first retry's delay. Each further one doubles it. */
  backoffMs: number;
  /** How many finished jobs are kept — enough to look at, not enough to fill Redis. */
  keepCompleted: number;
  /** Failed jobs are kept longer: they are the ones worth reading. */
  keepFailed: number;
}

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  logLevel: LogLevelName;
  docsEnabled: boolean;
  corsOrigins: string[];
  firebase: FirebaseConfig;
  scraping: ScrapingConfig;
  queue: QueueConfig;
}

const DEFAULT_PORT = 3001;
const DEFAULT_LOG_LEVEL: LogLevelName = 'log';
const DEFAULT_CORS_ORIGINS = 'http://localhost:3000';
const DEFAULT_FIREBASE_PROJECT_ID = 'demo-media-studio';
const DEFAULT_FIREBASE_API_KEY = 'demo-key';
const DEFAULT_FIREBASE_STORAGE_BUCKET = 'demo-media-studio.firebasestorage.app';
const DEFAULT_SCRAPING_BASE_URL = 'http://127.0.0.1:8000';
/** The scraping service's own per-operation default, so ours does not cut its short. */
const DEFAULT_SCRAPING_TIMEOUT_MS = 120_000;
const DEFAULT_SCRAPING_CACHE_TTL_DAYS = 30;
/** Where Redis is located by default. */
const DEFAULT_REDIS_HOST = '127.0.0.1';
const DEFAULT_REDIS_PORT = 6379;
const DEFAULT_QUEUE_PREFIX = 'media-studio';
const DEFAULT_QUEUE_ATTEMPTS = 3;
const DEFAULT_QUEUE_BACKOFF_MS = 5_000;
const DEFAULT_QUEUE_KEEP_COMPLETED = 100;
const DEFAULT_QUEUE_KEEP_FAILED = 500;

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
    corsOrigins: (env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID ?? DEFAULT_FIREBASE_PROJECT_ID,
      apiKey: env.FIREBASE_API_KEY ?? DEFAULT_FIREBASE_API_KEY,
      serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT ?? '',
      storageBucket: env.FIREBASE_STORAGE_BUCKET ?? DEFAULT_FIREBASE_STORAGE_BUCKET,
      // Named for the service each one stands in for, rather than after the
      // variables the Admin SDK reads — those are its business, and
      // `FirebaseAdminService` is where ours are handed over to them.
      emulators: {
        authenticationHost: env.FIREBASE_EMULATOR_AUTHENTICATION_HOST ?? '',
        firestoreHost: env.FIREBASE_EMULATOR_FIRESTORE_HOST ?? '',
        storageHost: env.FIREBASE_EMULATOR_STORAGE_HOST ?? '',
      },
    },
    scraping: {
      baseUrl: (env.SCRAPING_BASE_URL ?? DEFAULT_SCRAPING_BASE_URL).replace(/\/+$/, ''),
      timeoutMs: Number(env.SCRAPING_TIMEOUT_MS) || DEFAULT_SCRAPING_TIMEOUT_MS,
      cacheTtlDays: Number(env.SCRAPING_CACHE_TTL_DAYS) || DEFAULT_SCRAPING_CACHE_TTL_DAYS,
    },
    queue: {
      host: env.REDIS_HOST ?? DEFAULT_REDIS_HOST,
      port: Number(env.REDIS_PORT) || DEFAULT_REDIS_PORT,
      password: env.REDIS_PASSWORD ?? '',
      prefix: env.QUEUE_PREFIX ?? DEFAULT_QUEUE_PREFIX,
      attempts: Number(env.QUEUE_ATTEMPTS) || DEFAULT_QUEUE_ATTEMPTS,
      backoffMs: Number(env.QUEUE_BACKOFF_MS) || DEFAULT_QUEUE_BACKOFF_MS,
      keepCompleted: Number(env.QUEUE_KEEP_COMPLETED) || DEFAULT_QUEUE_KEEP_COMPLETED,
      keepFailed: Number(env.QUEUE_KEEP_FAILED) || DEFAULT_QUEUE_KEEP_FAILED,
    },
  };
}

export const CONFIG_NAMESPACE = 'app';

/** The single place `process.env` is read. */
export const appConfig = registerAs(CONFIG_NAMESPACE, () => loadConfig());
