import log from 'electron-log/main';
import path from 'node:path';
import { getAppBaseDir } from './paths';

// Levels, low to high severity: error, warn, info, verbose, debug, silly.
export type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly';

log.transports.file.resolvePathFn = () => path.join(getAppBaseDir(), 'logs', 'main.log');
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

export const logger = log;

/** Scoped logger for a single module, e.g. `createLogger('app-ping')` prefixes every line with `[app-ping]`. */
export function createLogger(scope: string) {
  return log.scope(scope);
}
