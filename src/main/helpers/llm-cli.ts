import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { getAppTempDir } from './paths';
import { LlmEngine, type LlmSettings } from '@/shared/llm';
import { logger } from './logger';

/** What one call cost, as the engine reports it — logged so a long run's token spend is visible. */
interface LlmUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

interface CodexTurnCompleted {
  type: string;
  usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number };
}

interface ClaudeResult {
  is_error: boolean;
  result: string;
  usage: { input_tokens: number; cache_read_input_tokens: number; output_tokens: number };
}

function logUsage(engine: LlmEngine, usage: LlmUsage, startTime: Date): void {
  logger.info(`[llm] ${engine} usage — input: ${usage.inputTokens} (${usage.cachedInputTokens} cached), output: ${usage.outputTokens}, duration: ${new Date().getTime() - startTime.getTime()}ms`);
}

/** How much of a failing CLI's own output is worth carrying into the error. */
const MAX_ERROR_CHARS = 600;

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
 * stderr, and a silent non-zero exit says nothing on its own.
 */
function cliFailure(command: string, code: number | null, signal: NodeJS.Signals | null, stderr: string, stdout: string): string {
  const how = signal ? `was killed by ${signal} after ${config.llm.timeoutMs / 1_000}s` : `exited ${code}`;
  const said = [stderr.trim(), stdout.trim()].filter((text) => text !== '').join(' | ');
  return said === ''
    ? `${command} ${how} without writing anything — check that it is installed, on PATH, and signed in.`
    : `${command} ${how}: ${said.slice(0, MAX_ERROR_CHARS)}`;
}

/** Runs the CLI with `prompt` on stdin, resolving to everything it wrote to stdout. */
function spawnCli(command: string, args: string[], prompt: string): Promise<string> {
  logger.debug(`[llm-cli] spawning CLI: ${command} ${args.join(' ')}`);
  const { file, argv, verbatim } = cliLaunch(command, args);

  return new Promise((resolve, reject) => {
    const child = spawn(file, argv, { cwd: getAppTempDir(), timeout: config.llm.timeoutMs, windowsHide: true, windowsVerbatimArguments: verbatim });
    let out = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code, signal) => (code === 0 ? resolve(out) : reject(new Error(cliFailure(command, code, signal, stderr, out)))));
    // A prompt runs to tens of kilobytes, so the pipe can break before it is drained.
    child.stdin.on('error', (error: Error) => reject(new Error(`${command} stopped reading the prompt: ${error.message}`)));
    child.stdin.end(prompt);
  });
}

/** The last `turn.completed` event of codex's `--json` stream, which carries the call's token usage. */
function parseCodexUsage(stdout: string): LlmUsage | undefined {
  for (const line of stdout.trim().split('\n').reverse()) {
    let event: CodexTurnCompleted;
    try {
      event = JSON.parse(line) as CodexTurnCompleted;
    } catch {
      continue;
    }
    if (event?.type !== 'turn.completed') continue;
    return { inputTokens: event.usage.input_tokens, cachedInputTokens: event.usage.cached_input_tokens, outputTokens: event.usage.output_tokens };
  }
  return undefined;
}

/**
 * Runs `codex exec` non-interactively and returns its final message parsed as
 * JSON. `--output-schema` forces the response into `schema` through OpenAI's
 * strict Structured Outputs mode, so nothing has to be salvaged from prose.
 * Read-only sandbox: the caller puts every fact the model needs in the prompt and
 * writes the filesystem itself, so codex never needs write access.
 */
async function runCodex(prompt: string, schema: object, model: string): Promise<unknown> {
  const startTime = new Date();
  const stamp = crypto.randomUUID();
  const tempDir = getAppTempDir();
  const outFile = path.join(tempDir, `codex-out-${stamp}.txt`);
  const schemaFile = path.join(tempDir, `codex-schema-${stamp}.json`);
  fs.writeFileSync(schemaFile, JSON.stringify(schema), 'utf8');

  try {
    const stdout = await spawnCli('codex', ['exec', '-s', 'read-only', '--skip-git-repo-check', '--color', 'never', '--json', '-m', model, '-o', outFile, '--output-schema', schemaFile, '-'], prompt);
    const usage = parseCodexUsage(stdout);
    if (usage) logUsage(LlmEngine.Codex, usage, startTime);
    return JSON.parse(fs.readFileSync(outFile, 'utf8').trim());
  } finally {
    fs.rmSync(outFile, { force: true });
    fs.rmSync(schemaFile, { force: true });
  }
}

/** Strips a ```json fence around the model's response, if it added one despite being told not to. */
function unfence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Runs `claude -p --output-format json` non-interactively and returns its final
 * message parsed as JSON. The CLI has no strict-schema flag like codex's
 * `--output-schema`, so the schema is asked for in the prompt instead.
 * `--permission-mode plan` keeps the call read-only, and it runs from a scratch
 * cwd so this app's own CLAUDE.md cannot leak into the prompt.
 */
async function runClaude(prompt: string, schema: object, model: string): Promise<unknown> {
  const startTime = new Date();
  const instructed = `${prompt}\n\nRespond with only a single JSON object, no markdown code fence and no commentary, matching exactly this JSON Schema:\n${JSON.stringify(schema)}`;
  const stdout = await spawnCli('claude', ['-p', '--output-format', 'json', '--model', model, '--permission-mode', 'plan'], instructed);

  const event = JSON.parse(stdout.trim()) as ClaudeResult;
  if (event.is_error) throw new Error(`claude returned an error: ${event.result}`);

  logUsage(LlmEngine.Claude, { inputTokens: event.usage.input_tokens, cachedInputTokens: event.usage.cache_read_input_tokens, outputTokens: event.usage.output_tokens }, startTime);
  return JSON.parse(unfence(event.result));
}

/**
 * Asks `llm`'s engine for one JSON object shaped by `schema`. Both engines take
 * the same prompt and schema, so a caller never has to know which one it got.
 */
export function runLlmJson(prompt: string, schema: object, llm: LlmSettings): Promise<unknown> {
  return llm.engine === LlmEngine.Codex ? runCodex(prompt, schema, llm.model) : runClaude(prompt, schema, llm.model);
}
