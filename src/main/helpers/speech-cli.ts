import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { config } from './config';
import { logger } from './logger';
import { getAppTempDir } from './paths';
import type { SpeechSettings } from '@/shared/app-workspace-narration';

/** The script this module drives, relative to the app root — it resolves its own imports off its own path. */
const SPEECH_SCRIPT = 'src/scripts/speech.py';

/** How much of the script's own stderr is worth carrying into an error. */
const MAX_ERROR_CHARS = 600;

/** One file for the script to read: the lines to speak, and the .wav to write (its .srt goes beside it). */
export interface SpeechJob {
  source: string;
  target: string;
}

/** What `speech.py` prints on stdout once a file has settled — see its module docstring. */
interface SpeechFileEvent {
  event: string;
  index: number;
  ok: boolean;
  error: string | null;
}

/**
 * One run of `speech.py` over a batch of files. The model is loaded once for the
 * whole batch, so the caller hands over every file it wants read and then waits
 * for each one's result in turn.
 */
export interface SpeechBatch {
  /** Settles when the file at `index` is written, or rejects with the script's reason. */
  result(index: number): Promise<void>;
  /** Stops the script if it is still running and drops the batch's list files. */
  close(): void;
}

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Awaited later, one at a time — an early rejection must not surface as unhandled in the meantime.
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

function appPath(relative: string): string {
  return path.isAbsolute(relative) ? relative : path.join(app.getAppPath(), relative);
}

function failureOf(code: number | null, signal: NodeJS.Signals | null, stderr: string): string {
  const how = signal ? `was stopped by ${signal}` : `exited ${code}`;
  const said = stderr.trim().slice(-MAX_ERROR_CHARS);
  return said === '' ? `speech.py ${how} without saying why — check that the scripts' virtualenv is set up (see src/scripts/requirements.txt).` : `speech.py ${how}: ${said}`;
}

/** Feeds the child's stdout to `onLine` one complete line at a time. */
function readLines(child: ChildProcess, onLine: (line: string) => void): void {
  let rest = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    const lines = (rest + chunk.toString()).split('\n');
    rest = lines.pop() ?? '';
    lines.forEach(onLine);
  });
}

/**
 * Starts `speech.py` over `jobs` with the workspace's voice and pace. The two
 * list files it takes are written to the temp dir. Its stdout's JSON lines settle
 * each job's promise — that is all this listens for. Its stderr is the script's
 * own log, which it also writes to `src/scripts/data/scripts.log`, so it is not
 * relayed into the app's; only a tail is kept for the error message a job still
 * unsettled when the script exits is failed with.
 */
export function startSpeechBatch(jobs: SpeechJob[], speech: SpeechSettings): SpeechBatch {
  const stamp = crypto.randomUUID();
  const tempDir = getAppTempDir();
  const inFile = path.join(tempDir, `speech-in-${stamp}.txt`);
  const outFile = path.join(tempDir, `speech-out-${stamp}.txt`);
  fs.writeFileSync(inFile, jobs.map((job) => job.source).join('\n') + '\n', 'utf8');
  fs.writeFileSync(outFile, jobs.map((job) => job.target).join('\n') + '\n', 'utf8');

  const { python, device, batchSize } = config.speech;
  const args = [appPath(SPEECH_SCRIPT), '--input-batch', inFile, '--output-batch', outFile, '--gen-srt', '--voice', speech.voice, '--pace', String(speech.pace), '--device', device, '--batch-size', String(batchSize)];
  logger.info(`[speech] reading ${jobs.length} file(s) with ${speech.voice} at ${speech.pace}× — ${appPath(python)} ${args.join(' ')}`);

  const results = jobs.map(deferred);
  let stderr = '';
  const child = spawn(appPath(python), args, { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });

  readLines(child, (line) => {
    let event: SpeechFileEvent;
    try {
      event = JSON.parse(line) as SpeechFileEvent;
    } catch {
      return;
    }
    if (event.event !== 'file' || !results[event.index]) return;
    if (event.ok) results[event.index].resolve();
    else results[event.index].reject(new Error(event.error ?? 'speech.py reported a failure without a reason'));
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-MAX_ERROR_CHARS * 4);
  });

  const cleanUp = () => {
    fs.rmSync(inFile, { force: true });
    fs.rmSync(outFile, { force: true });
  };

  child.on('error', (error) => {
    results.forEach((result) => result.reject(new Error(`speech.py could not be started: ${error.message}`)));
    cleanUp();
  });
  child.on('close', (code, signal) => {
    results.forEach((result) => result.reject(new Error(failureOf(code, signal, stderr))));
    cleanUp();
  });

  return {
    result: (index) => results[index].promise,
    close: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    },
  };
}

/** Reads `jobs` in one go and waits for every one of them — what a single retried chapter goes through. */
export async function runSpeechBatch(jobs: SpeechJob[], speech: SpeechSettings): Promise<void> {
  const batch = startSpeechBatch(jobs, speech);
  try {
    await Promise.all(jobs.map((_job, index) => batch.result(index)));
  } finally {
    batch.close();
  }
}
