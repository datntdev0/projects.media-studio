import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runCli } from './cli';
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

/** Runs the CLI from a scratch cwd with `prompt` on stdin, resolving to everything it wrote to stdout. */
function spawnCli(command: string, args: string[], prompt: string): Promise<string> {
  return runCli({ command, args, input: prompt, cwd: getAppTempDir(), timeoutMs: config.llm.timeoutMs });
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
