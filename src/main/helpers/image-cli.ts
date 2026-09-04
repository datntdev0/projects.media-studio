import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runCli } from './cli';
import { config, imageModel } from './config';
import { getAppTempDir } from './paths';
import { logger } from './logger';

/** How much of a failing call's own output is worth carrying into the error — a refusal by the image tool's safety system reads at the end of it. */
const MAX_ERROR_CHARS = 600;

/** How far a drawn file's timestamp may sit before the call that drew it — file clocks are not that precise. */
const CLOCK_SLACK_MS = 5_000;

/** What one image the step draws is asked for. `target` and `references` are relative to `dir`. */
export interface ImageJob {
  /** The folder codex runs from, so a relative reference path resolves — a workspace's `illustrations/`. */
  dir: string;
  /** The image prompt itself, handed over verbatim. */
  prompt: string;
  /** Where the .png goes, relative to `dir`. */
  target: string;
  /** Reference images relative to `dir` whose look the result must hold to. */
  references: string[];
  /** What those references fix and what the drawing may change — an outfit changes the clothing, a frame changes the scene. */
  referenceRule: string;
  /** The shape asked for, e.g. `a 16:9 landscape image, at least 1536x864 pixels`. */
  shape: string;
}

/**
 * What codex is told to do. It only draws: the file it produced is copied into
 * place here, because a Windows shell mangles both a CJK file name and the quoting
 * around it, so a copy asked of codex silently lands nowhere. Not touching files
 * also means the call needs no write sandbox and costs a fraction of the tokens.
 */
function instructionsFor(job: ImageJob): string {
  const references = job.references.length === 0
    ? '- There are no reference images; draw the subject from the prompt alone.'
    : `- The attached reference image(s) are ${job.references.map((file) => `\`${file}\``).join(', ')}. ${job.referenceRule}`;

  return [
    'Generate one illustration with your image generation tool.',
    '',
    'Draw exactly this. Pass it to the tool verbatim — do not rewrite, translate, shorten or add to it:',
    '',
    job.prompt,
    '',
    'Rules:',
    `- Call your image generation tool exactly once, asking for ${job.shape}.`,
    references,
    '- Do not copy, move, rename or otherwise touch any file. Run no shell commands at all.',
    '- Reply with nothing but the absolute path of the image file the tool produced.',
  ].join('\n');
}

/** The path codex answered with — its last line, stripped of the quoting a model sometimes wraps it in. */
function reportedPath(lastMessage: string): string {
  const lines = lastMessage.trim().split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return (lines[lines.length - 1] ?? '').replace(/^[`'"]+|[`'"]+$/g, '');
}

/**
 * Draws one image with the codex CLI's own image tool and leaves it at
 * `job.target`. There is no HTTP image API in play: codex is driven the way the
 * LLM steps drive it, read-only, since its image tool writes under its own home
 * rather than the workspace. It answers with the file it drew and this copies it
 * into place, which is the one step that has to be Node's — `fs` takes a CJK file
 * name that a shell will not.
 */
export async function generateImage(job: ImageJob): Promise<void> {
  const target = path.join(job.dir, job.target);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const answerFile = path.join(getAppTempDir(), `image-out-${crypto.randomUUID()}.txt`);
  const startedAt = Date.now();
  try {
    const stdout = await runCli({
      command: 'codex',
      args: ['exec', '-s', 'read-only', '--skip-git-repo-check', '--color', 'never', '-m', imageModel(), ...job.references.flatMap((file) => ['-i', file]), '-o', answerFile, '-'],
      input: instructionsFor(job),
      cwd: job.dir,
      timeoutMs: config.image.timeoutMs,
    });

    // Written during this call, not merely present: a model that answers with a path it drew earlier must not pass for a fresh image.
    const drawn = reportedPath(fs.existsSync(answerFile) ? fs.readFileSync(answerFile, 'utf8') : stdout);
    const stat = drawn !== '' && fs.existsSync(drawn) ? fs.statSync(drawn) : undefined;
    if (!stat || stat.size === 0 || stat.mtimeMs < startedAt - CLOCK_SLACK_MS) {
      throw new Error(`codex drew nothing for ${job.target} — ${stdout.trim().slice(-MAX_ERROR_CHARS)}. Edit the prompt this is drawn from and try again.`);
    }

    fs.copyFileSync(drawn, target);
    logger.info(`[image] drew ${job.target} (${fs.statSync(target).size} bytes)`);
  } finally {
    fs.rmSync(answerFile, { force: true });
  }
}
