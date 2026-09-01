import type { Db } from '@/main/database/client';
import { countWorkspaceStepProgress, createAppWorkspaceRun, getAppWorkspaceRun, listActiveAppWorkspaceRuns, listAppWorkspaceRuns, skipPendingAppWorkspaceActivities, updateAppWorkspaceRun } from '@/main/database/repositories/app-workspace-run.repo';
import { getAppWorkspace, updateAppWorkspaceRunState, updateAppWorkspaceStep } from '@/main/database/repositories/app-workspace.repo';
import { getAppLibrary } from '@/main/database/repositories/app-library.repo';
import { QUEUE_NAMES } from '@/main/queue/queue-names';
import type { MessageBus } from '@/main/queue/message-bus';
import { WORKSPACE_STEP_NAME, WORKSPACE_STEP_UNIT, WorkspaceStatus, WorkspaceStepState, WorkspaceStepUnit, type AppWorkspace, type WorkspaceStepKey } from '@/shared/app-workspace';
import { WorkspaceRunMode, WorkspaceRunStatus, isRunActive, isStepFinished, validateRunInput, type AppWorkspaceRun, type SubmitWorkspaceActivityInput, type SubmitWorkspaceRunInput, type WorkspaceActivityDraft, type WorkspaceRunStep, type WorkspaceRunStepPlan } from '@/shared/app-workspace-run';

export interface AppWorkspaceRunManager {
  list(workspaceId: string): AppWorkspaceRun[];
  get(id: string): AppWorkspaceRun | undefined;
  /** Records the run and, when it starts now, hands it to the orchestrator. No state is moved here. */
  submit(input: SubmitWorkspaceRunInput): AppWorkspaceRun;
  cancel(id: string): AppWorkspaceRun;
  /** Asks the orchestrator to look at every unfinished run — the scheduler's tick. */
  dispatchActive(): AppWorkspaceRun[];
}

/** One step of a submitted run, paired with its position in the preset. */
interface OrderedStep extends SubmitWorkspaceActivityInput {
  idx: number;
}

/** The step plan without the counts the repository tallies onto it. */
export function toStepPlan(step: WorkspaceRunStep): WorkspaceRunStepPlan {
  return {
    stepKey: step.stepKey,
    idx: step.idx,
    state: step.state,
    startAt: step.startAt,
    retries: step.retries,
    retryDelayMinutes: step.retryDelayMinutes,
    startedAt: step.startedAt,
    endedAt: step.endedAt,
    error: step.error,
  };
}

/** The novel's chapter count, or 0 when the novel is gone. */
export function novelChapterCountOf(db: Db, libraryId: string): number {
  return getAppLibrary(db, libraryId)?.novelMetadata?.discoveredCount ?? 0;
}

/**
 * Writes one step's progress onto the workspace, which is what every progress bar
 * reads. A step is measured against the whole novel, not the range a run happened
 * to cover, and its done count is every sub-step this workspace has worked — so a
 * run over part of the novel moves the bar part of the way.
 */
export function mirrorWorkspaceStepProgress(db: Db, workspaceId: string, stepKey: WorkspaceStepKey, state: WorkspaceStepState): void {
  const workspace = getAppWorkspace(db, workspaceId);
  const step = workspace?.steps.find((candidate) => candidate.key === stepKey);
  if (!workspace || !step) return;

  const worked = countWorkspaceStepProgress(db, workspaceId, stepKey);
  // Only the chapter-counted steps can be measured against the novel; export counts
  // the parts that have been prepared, which is all there is to go on.
  const totalCount = WORKSPACE_STEP_UNIT[stepKey] === WorkspaceStepUnit.Part ? worked.totalCount : novelChapterCountOf(db, workspace.libraryId);

  updateAppWorkspaceStep(db, workspaceId, stepKey, { state, doneCount: worked.doneCount, failedCount: worked.failedCount, totalCount });
}

/**
 * The workspace's own status once nothing is in flight. `Draft` doubles as idle
 * here: nothing booked, nothing finished, nothing failed.
 */
export function resyncWorkspaceStatus(db: Db, workspaceId: string): void {
  const workspace = getAppWorkspace(db, workspaceId);
  if (!workspace) return;

  const active = listAppWorkspaceRuns(db, workspaceId).find(isRunActive);
  if (active) {
    updateAppWorkspaceRunState(db, workspaceId, active.status === WorkspaceRunStatus.Running ? WorkspaceStatus.Running : WorkspaceStatus.Scheduled, workspace.lastRunAt);
    return;
  }

  const steps = workspace.steps;
  const status = steps.length > 0 && steps.every((step) => step.state === WorkspaceStepState.Done)
    ? WorkspaceStatus.Completed
    : steps.some((step) => step.state === WorkspaceStepState.Failed)
      ? WorkspaceStatus.Failed
      : WorkspaceStatus.Draft;

  updateAppWorkspaceRunState(db, workspaceId, status, workspace.lastRunAt);
}

export function createAppWorkspaceRunManager(db: Db, bus: MessageBus): AppWorkspaceRunManager {
  const needWorkspace = (id: string): AppWorkspace => {
    const workspace = getAppWorkspace(db, id);
    if (!workspace) {
      throw new Error(`Workspace ${id} not found`);
    }
    return workspace;
  };

  const needRun = (id: string): AppWorkspaceRun => {
    const run = getAppWorkspaceRun(db, id);
    if (!run) {
      throw new Error(`Run ${id} not found`);
    }
    return run;
  };

  const request = (run: AppWorkspaceRun): void => {
    bus.publish(QUEUE_NAMES.workspaceRunRequested, { runId: run.id });
  };

  /** The submitted steps in pipeline order, refusing anything the workspace does not run. */
  const orderSteps = (workspace: AppWorkspace, steps: SubmitWorkspaceActivityInput[]): OrderedStep[] => {
    const ordered = steps.map((step) => {
      const planned = workspace.steps.find((candidate) => candidate.key === step.stepKey);
      if (!planned) {
        throw new Error(`This workspace does not run ${WORKSPACE_STEP_NAME[step.stepKey]}.`);
      }
      return { ...step, idx: planned.idx };
    });

    if (new Set(ordered.map((step) => step.stepKey)).size !== ordered.length) {
      throw new Error('A step can only be listed once in a run.');
    }

    return ordered.sort((left, right) => left.idx - right.idx);
  };

  /**
   * One sub-step row per chapter in range. Export counts exporting parts, which
   * do not exist until they are prepared, so it starts with no sub-steps at all.
   */
  const subStepsOf = (stepKey: WorkspaceStepKey, fromChapter: number, toChapter: number): WorkspaceActivityDraft[] => {
    if (WORKSPACE_STEP_UNIT[stepKey] === WorkspaceStepUnit.Part) return [];
    return Array.from({ length: toChapter - fromChapter + 1 }, (_unused, offset) => ({ stepKey, subStepNo: fromChapter + offset }));
  };

  return {
    list: (workspaceId) => listAppWorkspaceRuns(db, workspaceId),

    get: (id) => getAppWorkspaceRun(db, id),

    submit: (input) => {
      const workspace = needWorkspace(input.workspaceId);
      if (listAppWorkspaceRuns(db, workspace.id).some(isRunActive)) {
        throw new Error('This workspace already has a run in flight — cancel it before submitting another.');
      }

      const immediate = input.mode === WorkspaceRunMode.Immediate;
      // Start times are a scheduled-only concept: an immediate run has no clock to wait on.
      const ordered = orderSteps(workspace, input.steps).map((step) => ({ ...step, startAt: immediate ? null : step.startAt }));

      const error = validateRunInput({ ...input, steps: ordered }, novelChapterCountOf(db, workspace.libraryId), Date.now());
      if (error) {
        throw new Error(error);
      }

      // Everything starts waiting: moving a run, its steps or the workspace is the orchestrator's job.
      const steps: WorkspaceRunStepPlan[] = ordered.map((step) => ({
        stepKey: step.stepKey,
        idx: step.idx,
        state: WorkspaceStepState.Pending,
        startAt: step.startAt,
        retries: step.retries,
        retryDelayMinutes: step.retryDelayMinutes,
        startedAt: null,
        endedAt: null,
        error: null,
      }));

      const run = createAppWorkspaceRun(db, {
        workspaceId: workspace.id,
        mode: input.mode,
        status: immediate ? WorkspaceRunStatus.Queued : WorkspaceRunStatus.Scheduled,
        fromChapter: input.fromChapter,
        toChapter: input.toChapter,
        startedAt: null,
        steps,
        activities: steps.flatMap((step) => subStepsOf(step.stepKey, input.fromChapter, input.toChapter)),
      });

      if (immediate) {
        request(run);
      }

      return run;
    },

    cancel: (id) => {
      const run = needRun(id);
      if (!isRunActive(run)) {
        throw new Error('This run has already finished.');
      }

      const now = Date.now();
      const steps = run.steps.map((step) => {
        if (isStepFinished(step)) return toStepPlan(step);
        // A step that was working stops where it got to — what it finished still counts.
        mirrorWorkspaceStepProgress(db, run.workspaceId, step.stepKey, WorkspaceStepState.Pending);
        return { ...toStepPlan(step), state: WorkspaceStepState.Skipped, endedAt: now };
      });

      skipPendingAppWorkspaceActivities(db, run.id, now);
      const cancelled = updateAppWorkspaceRun(db, id, { status: WorkspaceRunStatus.Cancelled, steps, startedAt: run.startedAt, endedAt: now });
      resyncWorkspaceStatus(db, run.workspaceId);
      return cancelled;
    },

    dispatchActive: () => {
      const runs = listActiveAppWorkspaceRuns(db);
      for (const run of runs) {
        request(run);
      }
      return runs;
    },
  };
}
