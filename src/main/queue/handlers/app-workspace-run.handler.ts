import { logger } from '@/main/helpers/logger';
import type { Db } from '@/main/database/client';
import type { Container } from '@/main/container';
import { QUEUE_NAMES } from '@/main/queue/queue-names';
import { getAppWorkspaceRun, updateAppWorkspaceRun, updateAppWorkspaceRunStep } from '@/main/database/repositories/app-workspace-run.repo';
import { getAppWorkspace, updateAppWorkspaceStatus as updateAppWorkspaceStatus, updateAppWorkspaceStep } from '@/main/database/repositories/app-workspace.repo';
import { AUDIO_NOVEL_STEP_HANDLERS } from '@/main/helpers/audio-novel';
import type { WorkspaceStepContext, WorkspaceStepHandler, WorkspaceStepOutcome } from '@/main/helpers/workspace-step';
import { mirrorWorkspaceStepProgress, resyncWorkspaceStatus } from '@/main/managers/app-workspace-run.manager';
import { AppWorkspace, WORKSPACE_STEP_NAME, WorkspacePreset, WorkspaceStatus, WorkspaceStepState, type WorkspaceStepKey } from '@/shared/app-workspace';
import { WorkspaceRunStatus, isRunActive, isStepFinished, type AppWorkspaceRun, type WorkspaceRunStep } from '@/shared/app-workspace-run';
import { getAppLibrary } from '@/main/database/repositories/app-library.repo';
import { AppLibrary } from '@/shared/app-library';

interface WorkspaceRunRequested {
  runId: string;
}

/** Which strategy works a step of which preset. Only the audio-novel pipeline has handlers today. */
const STEP_HANDLERS: Record<WorkspacePreset, Partial<Record<WorkspaceStepKey, WorkspaceStepHandler>>> = {
  [WorkspacePreset.AudioNovel]: AUDIO_NOVEL_STEP_HANDLERS,
  [WorkspacePreset.VideoRecap]: {},
};

/**
 * The orchestrator of a workspace run, and the only place a run, its steps or its
 * workspace change state. Concurrency is 1: one run is advanced at a time, so two
 * requests for the same run queue up instead of racing each other. Requests are
 * safe to repeat — the record is the authority, and a run that is cancelled or
 * already finished is left alone.
 */
export function registerAppWorkspaceRunHandler({ db, bus }: Container): void {
  bus.subscribe<WorkspaceRunRequested>(QUEUE_NAMES.workspaceRunRequested, (message) => orchestrateWorkspaceRun(db, message.payload.runId), { concurrency: 1 });
}

/**
 * Advances one run as far as it can go now, one step at a time and in order: it
 * starts the run, hands each step to the handler that knows how to work it, and
 * settles the run at the end. It returns at a step booked for a later time, which
 * the scheduler's tick brings back round.
 */
export async function orchestrateWorkspaceRun(db: Db, runId: string): Promise<void> {
  const opening = getAppWorkspaceRun(db, runId);
  if (!opening || !isRunActive(opening)) return;

  if (opening.status === WorkspaceRunStatus.Queued) {
    startRun(db, opening);
  }

  for (;;) {
    const run = getAppWorkspaceRun(db, runId);
    if (!run || !isRunActive(run)) return; // Stop if the run is no longer active

    const next = startableStepOf(run);
    if (!next) { completeRun(db, run); return; } // No more steps to work, settle the run

    if (next.state === WorkspaceStepState.Pending) {
      if (next.startAt !== null && next.startAt > Date.now()) {
        // Booked for later. Mirror what the workspace should look like while it waits.
        mirrorRunProgress(db, run);
        resyncWorkspaceStatus(db, run.workspaceId);
        return;
      }
      if (run.status !== WorkspaceRunStatus.Running) {
        startRun(db, run);
      }
    }

    const outcome = await startStep(db, run, next);
    if (outcome) completeStep(db, run, next, outcome);
  }
}

/** The step to work now: one already in flight, or the next waiting one with nothing unfinished ahead of it. */
function startableStepOf(run: AppWorkspaceRun): WorkspaceRunStep | undefined {
  const running = run.steps.find((step) => step.state === WorkspaceStepState.Running);
  if (running) return running;

  const pending = run.steps.find((step) => step.state === WorkspaceStepState.Pending);
  if (!pending) return undefined;
  return run.steps.some((step) => step.idx < pending.idx && !isStepFinished(step)) ? undefined : pending;
}

/** Marks the run under way, and the workspace with it. */
function startRun(db: Db, run: AppWorkspaceRun): void {
  const now = Date.now();
  const workspace = getAppWorkspace(db, run.workspaceId);
  const library = getAppLibrary(db, workspace!.libraryId);
  updateAppWorkspaceRun(db, run.id, { status: WorkspaceRunStatus.Running, startedAt: run.startedAt ?? now, endedAt: null });
  updateAppWorkspaceStatus(db, run.workspaceId, WorkspaceStatus.Running, run.startedAt ?? now);
  run.steps.forEach(step => queueStep(db, workspace!, library!, run, step));

  logger.info(`[run] #${run.seq} of workspace ${run.workspaceId} started — ${run.steps.length} step(s), ch. ${run.fromChapter}–${run.toChapter}`);
}

/** Queues a step for execution, preparing it in the database and marking it as pending. */
function queueStep(db: Db, workspace: AppWorkspace, library: AppLibrary, run: AppWorkspaceRun, step: WorkspaceRunStep): void {
  const name = WORKSPACE_STEP_NAME[step.stepKey];
  const handler = workspace && STEP_HANDLERS[workspace.preset][step.stepKey];
  if (!handler) throw new Error(`No handler for step ${name} in preset ${workspace?.preset}`);

  const context: WorkspaceStepContext = { db, ws: workspace, lib: library!, run, step, onProgress: () => {} };
  const totalCount = handler.totalCount(context).length;

  updateAppWorkspaceRunStep(db, run.id, step.stepKey, { state: WorkspaceStepState.Pending, totalCount, startedAt: null, endedAt: null, error: null });
  updateAppWorkspaceStep(db, run.workspaceId, step.stepKey, { state: WorkspaceStepState.Pending, totalCount, doneCount: 0, failedCount: 0 });
}

/**
 * Hands one step to its own handler, which works out the sub-steps it covers,
 * works them, and records each in the run's history. Returns what the step got
 * through, or undefined when the step could not be worked or stopped early.
 */
async function startStep(db: Db, run: AppWorkspaceRun, step: WorkspaceRunStep): Promise<WorkspaceStepOutcome | undefined> {
  const name = WORKSPACE_STEP_NAME[step.stepKey];
  const workspace = getAppWorkspace(db, run.workspaceId);
  const library = getAppLibrary(db, workspace!.libraryId);
  const handler = workspace && STEP_HANDLERS[workspace.preset][step.stepKey];
  if (!handler) throw new Error(`No handler for step ${name} in preset ${workspace?.preset}`);

  const context: WorkspaceStepContext = { db, ws: workspace!, lib: library!, run, step, onProgress: () => {} };
  
  const now = Date.now();
  const totalCount = step.totalCount;
  updateAppWorkspaceRunStep(db, run.id, step.stepKey, { state: WorkspaceStepState.Running, totalCount, startedAt: now, endedAt: null, error: null });
  updateAppWorkspaceStep(db, run.workspaceId, step.stepKey, { state: WorkspaceStepState.Running, totalCount, doneCount: 0, failedCount: 0 });
  logger.info(`[run] #${run.seq} ${name} started — ${totalCount} sub-step(s) to work`);

  context.onProgress = (doneCount, failedCount) => updateAppWorkspaceStep(db, run.workspaceId, step.stepKey, { state: WorkspaceStepState.Running, totalCount, doneCount, failedCount });
  const outcome = await handler.run(context);
  return outcome.stopped ? undefined : outcome;
}

/** Settles the step from what its handler got through. */
function completeStep(db: Db, run: AppWorkspaceRun, step: WorkspaceRunStep, outcome: WorkspaceStepOutcome): void {
  const now = Date.now();
  const state = outcome.failedCount > 0 ? WorkspaceStepState.Failed : WorkspaceStepState.Done;

  updateAppWorkspaceRunStep(db, run.id, step.stepKey, { state, totalCount: step.totalCount, startedAt: step.startedAt, endedAt: now, error: step.error });
  updateAppWorkspaceStep(db, run.workspaceId, step.stepKey, { state, totalCount: step.totalCount, doneCount: outcome.doneCount, failedCount: outcome.failedCount });
  logger.info(`[run] #${run.seq} ${WORKSPACE_STEP_NAME[step.stepKey]} ${state} — ${outcome.doneCount} done, ${outcome.failedCount} failed`);
}

/** Re-reads what the workspace has worked of the novel, so its pipeline shows this run's progress. */
function mirrorRunProgress(db: Db, run: AppWorkspaceRun): void {
  run.steps.forEach(step => mirrorWorkspaceStepProgress(db, run.workspaceId, step.stepKey, step.state, step.totalCount || undefined));
}

/** Ends the run once no step can be worked: everything finished, or a failed step blocks the rest. */
function completeRun(db: Db, run: AppWorkspaceRun): void {
  const failed = run.steps.some((step) => step.state === WorkspaceStepState.Failed);
  if (!failed && !run.steps.every(isStepFinished)) return;

  const now = Date.now();
  const wsStatus = failed ? WorkspaceStatus.Failed : WorkspaceStatus.Completed;
  const runStatus = failed ? WorkspaceRunStatus.Failed : WorkspaceRunStatus.Completed;
  updateAppWorkspaceRun(db, run.id, { status: runStatus, startedAt: run.startedAt, endedAt: now });
  updateAppWorkspaceStatus(db, run.workspaceId, wsStatus, now);

  logger.info(`[run] #${run.seq} of workspace ${run.workspaceId} ${runStatus}`);
}
