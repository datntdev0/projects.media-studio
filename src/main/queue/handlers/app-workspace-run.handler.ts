import { logger } from '@/main/helpers/logger';
import type { Db } from '@/main/database/client';
import type { Container } from '@/main/container';
import { QUEUE_NAMES } from '@/main/queue/queue-names';
import { completeAppWorkspaceActivity, getAppWorkspaceRun, getAppWorkspaceRunStatus, listPendingAppWorkspaceActivities, updateAppWorkspaceRun } from '@/main/database/repositories/app-workspace-run.repo';
import { updateAppWorkspaceRunState } from '@/main/database/repositories/app-workspace.repo';
import { mirrorWorkspaceStepProgress, resyncWorkspaceStatus, toStepPlan } from '@/main/managers/app-workspace-run.manager';
import { WORKSPACE_STEP_NAME, WorkspaceStatus, WorkspaceStepState, type WorkspaceStepKey } from '@/shared/app-workspace';
import { WorkspaceRunStatus, isRunActive, isStepFinished, type AppWorkspaceRun, type WorkspaceRunStep } from '@/shared/app-workspace-run';

interface WorkspaceRunRequested {
  runId: string;
}

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
 * Advances one run as far as it can go now: it starts the run, then works each
 * step's sub-steps in order, and stops when a step is booked for a later time
 * (the scheduler's tick brings it back) or when the run is settled.
 */
export async function orchestrateWorkspaceRun(db: Db, runId: string): Promise<void> {
  const opening = getAppWorkspaceRun(db, runId);
  if (!opening || !isRunActive(opening)) return;

  if (opening.status === WorkspaceRunStatus.Queued) {
    startRun(db, opening);
  }

  for (;;) {
    const run = getAppWorkspaceRun(db, runId);
    if (!run || !isRunActive(run)) return;

    const next = startableStepOf(run);
    if (!next) {
      settleRun(db, run);
      return;
    }

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
      startStep(db, run, next);
    }

    if (!(await workStep(db, run, next))) return;
    finishStep(db, runId, next.stepKey);
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
  updateAppWorkspaceRun(db, run.id, { status: WorkspaceRunStatus.Running, steps: run.steps.map(toStepPlan), startedAt: run.startedAt ?? now, endedAt: null });
  mirrorRunProgress(db, run);
  updateAppWorkspaceRunState(db, run.workspaceId, WorkspaceStatus.Running, run.startedAt ?? now);
  logger.info(`[run] #${run.seq} of workspace ${run.workspaceId} started — ${run.steps.length} step(s), ch. ${run.fromChapter}–${run.toChapter}`);
}

/** Re-reads what the workspace has worked of the novel, so its pipeline shows this run's progress. */
function mirrorRunProgress(db: Db, run: AppWorkspaceRun): void {
  for (const step of run.steps) {
    mirrorWorkspaceStepProgress(db, run.workspaceId, step.stepKey, step.state);
  }
}

function startStep(db: Db, run: AppWorkspaceRun, step: WorkspaceRunStep): void {
  const now = Date.now();
  const steps = run.steps.map((candidate) => (candidate.stepKey === step.stepKey ? { ...toStepPlan(candidate), state: WorkspaceStepState.Running, startedAt: now } : toStepPlan(candidate)));
  updateAppWorkspaceRun(db, run.id, { status: WorkspaceRunStatus.Running, steps, startedAt: run.startedAt ?? now, endedAt: null });
  mirrorWorkspaceStepProgress(db, run.workspaceId, step.stepKey, WorkspaceStepState.Running);
}

/**
 * Works every sub-step of one step, in order. Nothing does the real work yet: a
 * sub-step logs itself and is marked completed. Returns false when the run was
 * cancelled under us, so the caller stops touching it.
 */
async function workStep(db: Db, run: AppWorkspaceRun, step: WorkspaceRunStep): Promise<boolean> {
  const name = WORKSPACE_STEP_NAME[step.stepKey];
  const pending = listPendingAppWorkspaceActivities(db, run.id, step.stepKey);
  logger.info(`[run] #${run.seq} ${name} started — ${pending.length} sub-step(s) to work`);

  for (const activity of pending) {
    // One sub-step per turn of the event loop, so the app stays responsive and a cancel can land between them.
    await nextTurn();
    if (getAppWorkspaceRunStatus(db, run.id) !== WorkspaceRunStatus.Running) {
      logger.info(`[run] #${run.seq} ${name} stopped — the run is no longer running`);
      return false;
    }

    const startedAt = Date.now();
    logger.debug(`[run] #${run.seq} ${name} sub-step ${activity.subStepNo} completed`);
    completeAppWorkspaceActivity(db, activity.id, startedAt, Date.now());

    mirrorWorkspaceStepProgress(db, run.workspaceId, step.stepKey, WorkspaceStepState.Running);
  }

  return true;
}

/** Settles the step from the counts its sub-step rows now carry. */
function finishStep(db: Db, runId: string, stepKey: WorkspaceStepKey): void {
  const run = getAppWorkspaceRun(db, runId);
  const worked = run?.steps.find((step) => step.stepKey === stepKey);
  if (!run || !worked) return;

  const now = Date.now();
  const failed = worked.failedCount > 0;
  const state = failed ? WorkspaceStepState.Failed : WorkspaceStepState.Done;
  const steps = run.steps.map((step) => (step.stepKey === stepKey ? { ...toStepPlan(step), state, endedAt: now } : toStepPlan(step)));

  updateAppWorkspaceRun(db, run.id, { status: run.status, steps, startedAt: run.startedAt, endedAt: null });
  mirrorWorkspaceStepProgress(db, run.workspaceId, stepKey, state);
  logger.info(`[run] #${run.seq} ${WORKSPACE_STEP_NAME[stepKey]} ${state} — ${worked.doneCount} of ${worked.totalCount} sub-step(s)`);
}

/** Ends the run once no step can be worked: everything finished, or a failed step blocks the rest. */
function settleRun(db: Db, run: AppWorkspaceRun): void {
  const failed = run.steps.some((step) => step.state === WorkspaceStepState.Failed);
  if (!failed && !run.steps.every(isStepFinished)) return;

  const status = failed ? WorkspaceRunStatus.Failed : WorkspaceRunStatus.Completed;
  updateAppWorkspaceRun(db, run.id, { status, steps: run.steps.map(toStepPlan), startedAt: run.startedAt, endedAt: Date.now() });
  resyncWorkspaceStatus(db, run.workspaceId);
  logger.info(`[run] #${run.seq} of workspace ${run.workspaceId} ${status}`);
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
