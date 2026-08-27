import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLogger } from './logger';
import { AnalyzeEngine } from '../../shared/app-workflow-activity';

const logger = createLogger('llm-cli');

const DEFAULT_CODEX_MODEL = process.env.CODEX_MODEL ?? 'gpt-5.5';
const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5';
const DEFAULT_TIMEOUT_MS = 300_000;

export interface LlmUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface LlmPrintOptions {
  schema?: object;
  timeoutMs?: number;
  /** Called with the call's token usage once it succeeds. */
  onUsage?: (usage: LlmUsage) => void;
}

/** Sums `LlmUsage` across multiple calls — one per pipeline run, to log a run's total token cost alongside its per-call breakdown. */
export function createUsageAccumulator(): { add(usage: LlmUsage): void; total: LlmUsage } {
  const total: LlmUsage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };
  return {
    add(usage) {
      total.inputTokens += usage.inputTokens;
      total.cachedInputTokens += usage.cachedInputTokens;
      total.cacheWriteInputTokens += usage.cacheWriteInputTokens;
      total.outputTokens += usage.outputTokens;
      total.reasoningOutputTokens += usage.reasoningOutputTokens;
    },
    total,
  };
}

interface TurnCompletedEvent {
  type: 'turn.completed';
  usage: { input_tokens: number; cached_input_tokens: number; cache_write_input_tokens: number; output_tokens: number; reasoning_output_tokens: number };
}

function parseCodexUsage(stdout: string): LlmUsage | null {
  for (const line of stdout.trim().split('\n').reverse()) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event && typeof event === 'object' && (event as { type?: string }).type === 'turn.completed') {
      const { usage } = event as TurnCompletedEvent;
      return {
        inputTokens: usage.input_tokens,
        cachedInputTokens: usage.cached_input_tokens,
        cacheWriteInputTokens: usage.cache_write_input_tokens,
        outputTokens: usage.output_tokens,
        reasoningOutputTokens: usage.reasoning_output_tokens,
      };
    }
  }
  return null;
}

/**
 * Runs `codex exec` non-interactively with `prompt` on stdin and returns its final message —
 * parsed as JSON when `schema` is given, which is passed via `--output-schema` to force the
 * model's final response into that shape (OpenAI's strict Structured Outputs mode — every object
 * in `schema` must set `additionalProperties: false` and list every key as `required`, no
 * dynamic-keyed maps). Read-only sandbox: the caller supplies every fact the model needs in the
 * prompt and reads/writes the filesystem itself, so codex never needs write access. Model
 * defaults to `gpt-5.5`, overridable via the `CODEX_MODEL` env var. Every call's token usage
 * (parsed from `--json`'s event stream) is logged, and handed to `onUsage` if given.
 */
async function runCodexPrint(prompt: string, options: LlmPrintOptions = {}): Promise<unknown> {
  const stamp = crypto.randomUUID();
  const outFile = path.join(os.tmpdir(), `codex-out-${stamp}.txt`);
  const schemaFile = options.schema ? path.join(os.tmpdir(), `codex-schema-${stamp}.json`) : null;
  if (schemaFile) {
    fs.writeFileSync(schemaFile, JSON.stringify(options.schema), 'utf8');
  }

  const args = ['exec', '-s', 'read-only', '--skip-git-repo-check', '--color', 'never', '--json', '-m', DEFAULT_CODEX_MODEL, '-o', outFile];
  if (schemaFile) {
    args.push('--output-schema', schemaFile);
  }
  args.push('-');

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn('codex', args, { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });
      let out = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`codex exited ${code}: ${stderr.trim()}`))));
      child.stdin.end(prompt);
    });

    const usage = parseCodexUsage(stdout);
    if (usage) {
      logger.info(`codex usage — input: ${usage.inputTokens} (${usage.cachedInputTokens} cached), output: ${usage.outputTokens} (${usage.reasoningOutputTokens} reasoning)`);
      options.onUsage?.(usage);
    }

    const output = fs.readFileSync(outFile, 'utf8').trim();
    return options.schema ? JSON.parse(output) : output;
  } finally {
    fs.rmSync(outFile, { force: true });
    if (schemaFile) {
      fs.rmSync(schemaFile, { force: true });
    }
  }
}

interface ClaudeResultEvent {
  is_error: boolean;
  result: string;
  usage: { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens: number; output_tokens_details?: { thinking_tokens?: number } };
}

function claudeSchemaInstruction(schema: object): string {
  return `\n\nRespond with only a single JSON object, no markdown code fence, no commentary, matching exactly this JSON Schema:\n${JSON.stringify(schema)}`;
}

/** Strips a ```json fence around the model's response, if it added one despite being told not to. */
function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Runs `claude -p --output-format json` non-interactively with `prompt` on stdin and returns its
 * final message — parsed as JSON when `schema` is given. The CLI has no strict-schema flag like
 * codex's `--output-schema`, so the schema is embedded as an instruction in the prompt instead.
 * `--permission-mode plan` keeps the call read-only, mirroring codex's `-s read-only` sandbox — the
 * caller supplies every fact the model needs in the prompt and reads/writes the filesystem itself.
 * Runs from a scratch cwd so this app's own CLAUDE.md doesn't leak into chapter-analysis prompts.
 * Model defaults to `claude-sonnet-5`, overridable via the `CLAUDE_MODEL` env var. Every call's
 * token usage is logged, and handed to `onUsage` if given.
 */
async function runClaudePrint(prompt: string, options: LlmPrintOptions = {}): Promise<unknown> {
  const fullPrompt = options.schema ? `${prompt}${claudeSchemaInstruction(options.schema)}` : prompt;
  const args = ['-p', '--output-format', 'json', '--model', DEFAULT_CLAUDE_MODEL, '--permission-mode', 'plan'];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn('claude', args, { cwd: os.tmpdir(), timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    let out = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`claude exited ${code}: ${stderr.trim()}`))));
    child.stdin.end(fullPrompt);
  });

  const event = JSON.parse(stdout.trim()) as ClaudeResultEvent;
  if (event.is_error) {
    throw new Error(`claude returned an error: ${event.result}`);
  }

  const usage: LlmUsage = {
    inputTokens: event.usage.input_tokens,
    cachedInputTokens: event.usage.cache_read_input_tokens,
    cacheWriteInputTokens: event.usage.cache_creation_input_tokens,
    outputTokens: event.usage.output_tokens,
    reasoningOutputTokens: event.usage.output_tokens_details?.thinking_tokens ?? 0,
  };
  logger.info(`claude usage — input: ${usage.inputTokens} (${usage.cachedInputTokens} cached), output: ${usage.outputTokens} (${usage.reasoningOutputTokens} reasoning)`);
  options.onUsage?.(usage);

  const text = event.result.trim();
  return options.schema ? JSON.parse(extractJson(text)) : text;
}

/** Dispatches a prompt to the activity's configured engine — same prompt/schema contract either way, so the analyze pipeline stays engine-agnostic. */
export function runLlmPrint(engine: AnalyzeEngine, prompt: string, options: LlmPrintOptions = {}): Promise<unknown> {
  return engine === AnalyzeEngine.Claude ? runClaudePrint(prompt, options) : runCodexPrint(prompt, options);
}
