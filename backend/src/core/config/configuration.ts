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
}

export interface FirebaseConfig {
  /** The `demo-` prefix marks an emulator-only project, and fails loudly against the real API. */
  projectId: string;
  /** The web API key. Used to check a password before changing it — see IdentityToolkitClient. */
  apiKey: string;
  /** A service account, as inline JSON. Empty falls back to application default credentials. */
  serviceAccountJson: string;
  emulators: FirebaseEmulatorConfig;
}

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  logLevel: LogLevelName;
  /** Serve Swagger UI and the OpenAPI document. */
  docsEnabled: boolean;
  /** Origins the browser app is served from. */
  corsOrigins: string[];
  firebase: FirebaseConfig;
}

const DEFAULT_PORT = 3001;
const DEFAULT_LOG_LEVEL: LogLevelName = 'log';
const DEFAULT_CORS_ORIGINS = 'http://localhost:3000';
const DEFAULT_FIREBASE_PROJECT_ID = 'demo-media-studio';
const DEFAULT_FIREBASE_API_KEY = 'demo-key';

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
      // Named for the service each one stands in for, rather than after the
      // variables the Admin SDK reads — those are its business, and
      // `FirebaseAdminService` is where ours are handed over to them.
      emulators: {
        authenticationHost: env.FIREBASE_EMULATOR_AUTHENTICATION_HOST ?? '',
        firestoreHost: env.FIREBASE_EMULATOR_FIRESTORE_HOST ?? '',
      },
    },
  };
}

export const CONFIG_NAMESPACE = 'app';

/** The single place `process.env` is read. */
export const appConfig = registerAs(CONFIG_NAMESPACE, () => loadConfig());
