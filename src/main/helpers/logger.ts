import fs from 'node:fs';
import path from 'node:path';
import { getAppDataDir } from './paths';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const CONSOLE_METHOD: Record<LogLevel, (message: string) => void> = {
  debug: (message) => console.debug(message),
  info: (message) => console.info(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

let stream: fs.WriteStream | undefined;

/** Absolute path of the main process log file. */
export function getLogFilePath(): string {
  return path.join(getAppDataDir(), 'main.log');
}

// Opened lazily and kept open: the append stream survives the whole process,
// so every write after the first skips the open/close round trip.
function getStream(): fs.WriteStream | undefined {
  if (stream) return stream;

  try {
    const filePath = getLogFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    stream = fs.createWriteStream(filePath, { flags: 'a' });
    stream.on('error', (error) => console.error('[logger] log file write failed', error));
    return stream;
  } catch (error) {
    console.error('[logger] could not open log file', error);
    return undefined;
  }
}

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// One formatted line for both sinks, so the console reads exactly like the file.
function write(level: LogLevel, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${args.map(formatArg).join(' ')}`;
  CONSOLE_METHOD[level](line);
  getStream()?.write(`${line}\n`);
}

export const logger = {
  debug: (...args: unknown[]) => write('debug', args),
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),
};

export function closeLogger(): void {
  stream?.end();
  stream = undefined;
}
