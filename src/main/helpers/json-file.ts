import fs from 'node:fs';
import path from 'node:path';

/** The file parsed, or undefined when it is missing or no longer readable JSON. */
export function readJsonFile<T>(file: string): T | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** Writes the value pretty-printed, creating the folder on the way. */
export function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

/** When the file was last written, epoch ms, or undefined when there is none. */
export function fileWrittenAt(file: string): number | undefined {
  return fs.existsSync(file) ? fs.statSync(file).mtimeMs : undefined;
}
