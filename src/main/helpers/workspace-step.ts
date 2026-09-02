import { logger } from '@/main/helpers/logger';
import type { Db } from '@/main/database/client';
import { createAppWorkspaceActivity, getAppWorkspaceRunStatus } from '@/main/database/repositories/app-workspace-run.repo';
import { AppWorkspace, WORKSPACE_STEP_NAME, WORKSPACE_STEP_UNIT, WorkspaceStepState, WorkspaceStepUnit, type WorkspaceStepKey } from '@/shared/app-workspace';
import { WorkspaceRunStatus, retryDelayMsOf, type AppWorkspaceRun, type WorkspaceRunStep } from '@/shared/app-workspace-run';
import { AppLibrary } from '@/shared/app-library';

/** What a step handler is given to work one step of one run. */
export interface WorkspaceStepContext {
  db: Db;
  ws: AppWorkspace;
  lib: AppLibrary;
  run: AppWorkspaceRun;
  step: WorkspaceRunStep;
  onProgress(doneCount: number, failedCount: number): void;
}

/** What a step handler reports once it has worked what it could. */
export interface WorkspaceStepOutcome {
  doneCount: number;
  failedCount: number;
  stopped: boolean;
}

/**
 * The strategy for one step of a pipeline. It owns the step's inner logic —
 * which sub-steps the step covers, how each is worked, and recording every one
 * of them in the run's history. It knows nothing about ordering, run status or
 * the workspace's own state, which the orchestrator owns.
 */
export interface WorkspaceStepHandler {
  key: WorkspaceStepKey;
  totalCount(context: WorkspaceStepContext): number[]; // The total progress of the step not the submitted sub-steps
  subStepsOf(context: WorkspaceStepContext): number[]; // The sub-steps that have been submitted for this step
  run(context: WorkspaceStepContext): Promise<WorkspaceStepOutcome>;
}

/** How often the stand-in work below fails, until the real work replaces it. */
export const SIMULATED_FAILURE_RATE = 0.00;

/** How long the stand-in work below takes, so a run advances at a watchable pace. */
const SIMULATED_WORK_MS = 1_000;

/** How often a waiting retry looks up to see whether the run is still going. */
const RETRY_WAIT_SLICE_MS = 1_000;

export function fullChaptersOf(context: WorkspaceStepContext): number[] {
  return Array.from(
    { length: context.lib.novelMetadata?.discoveredCount ?? 0 },
    (_unused, offset) => offset + 1
  );
}

/** Every chapter of the run's range — the sub-steps of a chapter-counted step. */
export function submittedChaptersOf(context: WorkspaceStepContext): number[] {
  return Array.from(
    { length: context.run.toChapter - context.run.fromChapter + 1 },
    (_unused, offset) => context.run.fromChapter + offset);
}

function unitLabelOf(stepKey: WorkspaceStepKey): string {
  return WORKSPACE_STEP_UNIT[stepKey] === WorkspaceStepUnit.Part ? 'part' : 'chapter';
}

function isRunRunning(db: Db, runId: string): boolean {
  return getAppWorkspaceRunStatus(db, runId) === WorkspaceRunStatus.Running;
}

/**
 * Works a step's sub-steps one at a time, appending each outcome to the run's
 * activity history, and stops if the run is cancelled under it. Handlers share
 * this so the only thing each has to bring is the work itself.
 */
export async function workSubSteps(context: WorkspaceStepContext, subStepNos: number[], work: (subStepNo: number) => Promise<void>): Promise<WorkspaceStepOutcome> {
  const { db, run, step } = context;
  const name = WORKSPACE_STEP_NAME[step.stepKey];
  let doneCount = 0;
  let failedCount = 0;

  for (const subStepNo of subStepNos) {
    // One sub-step per turn of the event loop, so the app stays responsive and a cancel can land between them.
    await nextTurn();
    if (!isRunRunning(db, run.id)) {
      logger.info(`[run] #${run.seq} ${name} stopped — the run is no longer running`);
      return { doneCount, failedCount, stopped: true };
    }

    const state = await workSubStep(context, subStepNo, work);
    if (!state) {
      logger.info(`[run] #${run.seq} ${name} stopped — the run is no longer running`);
      return { doneCount, failedCount, stopped: true };
    }

    if (state === WorkspaceStepState.Done) doneCount += 1;
    else failedCount += 1;

    context.onProgress(doneCount, failedCount);
  }

  return { doneCount, failedCount, stopped: false };
}

/**
 * Works one sub-step, trying it again as the step's retry policy allows: every
 * attempt is appended to the history, and the sub-step is done as soon as one of
 * them lands. Undefined means the run stopped while a retry was waiting.
 */
async function workSubStep(context: WorkspaceStepContext, subStepNo: number, work: (subStepNo: number) => Promise<void>): Promise<WorkspaceStepState | undefined> {
  const { db, run, step } = context;
  const name = WORKSPACE_STEP_NAME[step.stepKey];
  const lastAttempt = step.retries + 1;

  for (let attempt = 1; ; attempt += 1) {
    const startedAt = Date.now();
    try {
      await work(subStepNo);
      createAppWorkspaceActivity(db, { runId: run.id, stepKey: step.stepKey, subStepNo, state: WorkspaceStepState.Done, attempt, error: null, startedAt, endedAt: Date.now() });
      return WorkspaceStepState.Done;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[run] #${run.seq} ${name} ${unitLabelOf(step.stepKey)} ${subStepNo} failed on attempt ${attempt}/${lastAttempt} — ${message}`);
      createAppWorkspaceActivity(db, { runId: run.id, stepKey: step.stepKey, subStepNo, state: WorkspaceStepState.Failed, attempt, error: message, startedAt, endedAt: Date.now() });

      if (attempt >= lastAttempt) return WorkspaceStepState.Failed;
      if (!(await waitToRetry(context, attempt))) return undefined;
    }
  }
}

/** Holds the next attempt back by the step's backed-off retry delay, giving up if the run stops while it waits. */
async function waitToRetry(context: WorkspaceStepContext, attempt: number): Promise<boolean> {
  const { db, run, step } = context;
  const waitMs = retryDelayMsOf(step.retryDelayMinutes, attempt);
  const until = Date.now() + waitMs;
  if (waitMs > 0) {
    logger.debug(`[run] #${run.seq} ${WORKSPACE_STEP_NAME[step.stepKey]} retrying in ${waitMs / 60_000} minute(s)`);
  }

  while (Date.now() < until) {
    await delay(Math.min(RETRY_WAIT_SLICE_MS, until - Date.now()));
    if (!isRunRunning(db, run.id)) return false;
  }

  return true;
}

/**
 * Stands in for work that is not built yet: it logs what the step would do to
 * this sub-step, and fails as the real thing sometimes will, so the pipeline's
 * failure paths are exercised rather than only its happy one.
 */
export async function simulateSubStep(stepKey: WorkspaceStepKey, run: AppWorkspaceRun, subStepNo: number, doing: string): Promise<void> {
  logger.debug(`[run] #${run.seq} ${WORKSPACE_STEP_NAME[stepKey]} ${unitLabelOf(stepKey)} ${subStepNo} — ${doing}`);
  await delay(SIMULATED_WORK_MS);

  if (Math.random() < SIMULATED_FAILURE_RATE) {
    throw new Error(`${doing} failed on ${unitLabelOf(stepKey)} ${subStepNo}`);
  }
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
