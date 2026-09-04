import { spawn } from 'node:child_process';
import { logger } from './logger';

/** How much of a failing CLI's own output is worth carrying into the error. */
const MAX_ERROR_CHARS = 600;

export interface CliRun {
  command: string;
  args: string[];
  /** Fed to the process on stdin, then closed. */
  input: string;
  cwd: string;
  timeoutMs: number;
}

/**
 * How one of these CLIs is launched. Windows cannot exec the `.cmd` shim npm
 * installs a CLI as, so the command line goes through cmd.exe there — as one
 * already-joined string, since handing an args array to a shell is deprecated
 * (DEP0190). Everywhere else the args go straight to the executable, no shell in
 * between. Nothing user-supplied reaches the command line either way: the prompt
 * travels on stdin, and the rest is literals plus config.json's own model names.
 */
function cliLaunch(command: string, args: string[]): { file: string; argv: string[]; verbatim: boolean } {
  if (process.platform !== 'win32') {
    return { file: command, argv: args, verbatim: false };
  }
  return { file: process.env.ComSpec ?? 'cmd.exe', argv: ['/d', '/s', '/c', `"${command} ${args.join(' ')}"`], verbatim: true };
}

/**
 * Why the call failed, in as much detail as the CLI left behind — both streams,
 * because `--output-format json` reports some errors on stdout rather than
 * stderr, and a silent non-zero exit says nothing on its own. The tail is what is
 * kept: these CLIs echo the whole prompt first, so the head of their output is
 * only the prompt back again and the reason is always at the end.
 */
export function cliFailure(command: string, how: string, stderr: string, stdout: string): string {
  const said = [stderr.trim(), stdout.trim()].filter((text) => text !== '').join(' | ');
  return said === ''
    ? `${command} ${how} without writing anything — check that it is installed, on PATH, and signed in.`
    : `${command} ${how}: ${said.slice(-MAX_ERROR_CHARS)}`;
}

/** Runs the CLI with `input` on stdin, resolving to everything it wrote to stdout. */
export function runCli({ command, args, input, cwd, timeoutMs }: CliRun): Promise<string> {
  logger.debug(`[cli] spawning: ${command} ${args.join(' ')}`);
  const { file, argv, verbatim } = cliLaunch(command, args);

  return new Promise((resolve, reject) => {
    const child = spawn(file, argv, { cwd, timeout: timeoutMs, windowsHide: true, windowsVerbatimArguments: verbatim });
    let out = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) return resolve(out);
      const how = signal ? `was killed by ${signal} after ${timeoutMs / 1_000}s` : `exited ${code}`;
      reject(new Error(cliFailure(command, how, stderr, out)));
    });
    // A prompt runs to tens of kilobytes, so the pipe can break before it is drained.
    child.stdin.on('error', (error: Error) => reject(new Error(`${command} stopped reading the prompt: ${error.message}`)));
    child.stdin.end(input);
  });
}
