import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { LOG_LEVELS, LogLevelName } from '../config/configuration';
import { currentRequestId } from './request-context';

/** Longer than this in the console and the id is shortened to its first 8. */
const CONSOLE_REQUEST_ID_LIMIT = 12;

/**
 * Every level at or above the configured one.
 *
 * LOG_LEVEL is read from the environment without being checked, so an
 * unrecognised value has to land somewhere sensible here. Falling through to
 * `indexOf`'s -1 would silence everything below `fatal` — a typo would look
 * exactly like a service that had stopped logging.
 */
export function enabledLevels(level: LogLevelName): LogLevel[] {
  const from = LOG_LEVELS.indexOf(level);

  return LOG_LEVELS.slice(from === -1 ? LOG_LEVELS.indexOf('log') : from);
}

/**
 * A JSON log line: what `ConsoleLogger` emits, plus our request id. Spelled out
 * because the base method is protected, so its return type cannot be read from
 * outside the class.
 */
export interface JsonLogEntry {
  level: LogLevel;
  pid: number;
  timestamp: number;
  message: unknown;
  context?: string;
  stack?: unknown;
  requestId?: string;
}

/**
 * The application logger.
 *
 * Nest 11's `ConsoleLogger` already formats, colours and emits JSON, so this
 * adds the one thing it cannot know: which request a line belongs to. Both
 * output shapes carry the id — the full value in JSON for machines, a short
 * prefix in the console for reading over a developer's shoulder.
 */
@Injectable()
export class AppLogger extends ConsoleLogger {
  constructor(config: AppConfigService) {
    super({
      // Machines read production, people read everything else.
      json: config.isProduction,
      colors: !config.isProduction,
      logLevels: enabledLevels(config.logLevel),
      // Jest buffers process.stdout.write but not console.log.
      forceConsole: config.isTest,
    });
  }

  protected getJsonLogObject(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
    },
  ): JsonLogEntry {
    const base = super.getJsonLogObject(message, options);
    const requestId = currentRequestId();

    return requestId ? { ...base, requestId } : base;
  }

  protected formatContext(context: string): string {
    const requestId = currentRequestId();
    if (!requestId) {
      return super.formatContext(context);
    }

    // A generated uuid is shortened to keep console lines readable, but a
    // caller-supplied id is left whole — clipping it would print something that
    // reads like a different id than the one the caller sent.
    const short =
      requestId.length > CONSOLE_REQUEST_ID_LIMIT
        ? requestId.slice(0, 8)
        : requestId;

    return super.formatContext(context ? `${context} ${short}` : short);
  }
}
