// Types and IPC contract shared between the main process, the preload bridge and
// the renderer for a workspace's run history — one row per execution in
// `app_workspace_runs`, carrying its step plan, plus one row per sub-step of
// that execution (a chapter, or an exporting part) in `app_workspace_activities`
// (see database/migrations/V0.1.2__create_app_workspace_runs.sql).

import { WORKSPACE_STEP_NAME, WorkspaceStepKey, WorkspaceStepState, type WorkspaceStepCounts } from './app-workspace';

export enum WorkspaceRunMode {
  Immediate = 'immediate',
  Scheduled = 'scheduled',
}

export enum WorkspaceRunStatus {
  /** Submitted and handed to the orchestrator, which has not picked it up yet. */
  Queued = 'queued',
  /** Booked for later — waiting for the start time its first step carries. */
  Scheduled = 'scheduled',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

/**
 * One step of one run as it is stored on the run itself. `startAt` is the step's
 * own booked start; null means it starts as soon as the step ahead of it
 * completes, which is every step of an immediate run.
 */
export interface WorkspaceRunStepPlan {
  stepKey: WorkspaceStepKey;
  /** The step's position in the preset, so a run reads in pipeline order. */
  idx: number;
  state: WorkspaceStepState;
  startAt: number | null;
  /** Attempts per sub-step after the first failure, 0 for none. */
  retries: number;
  retryDelayMinutes: number;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
}

/** A run's step with the counts read back off its sub-step rows. */
export interface WorkspaceRunStep extends WorkspaceRunStepPlan, WorkspaceStepCounts {}

/**
 * One sub-step run — the unit of work a run is actually made of. `subStepNo` is
 * a chapter number for the chapter-counted steps and a part number for export,
 * and `attempt` counts the tries it has taken under its step's retry policy.
 */
export interface WorkspaceActivity {
  id: string;
  runId: string;
  stepKey: WorkspaceStepKey;
  subStepNo: number;
  state: WorkspaceStepState;
  attempt: number;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

export interface AppWorkspaceRun {
  id: string;
  workspaceId: string;
  /** Per-workspace counter, so a run keeps the same label for life. */
  seq: number;
  mode: WorkspaceRunMode;
  status: WorkspaceRunStatus;
  fromChapter: number;
  toChapter: number;
  /** In `idx` order — only the steps this run was asked to cover. */
  steps: WorkspaceRunStep[];
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** One step as the submitter asks for it. A step left out of `steps` is not part of the run. */
export interface SubmitWorkspaceActivityInput {
  stepKey: WorkspaceStepKey;
  /** Epoch ms, or null to start right after the previous step of the run. */
  startAt: number | null;
  retries: number;
  retryDelayMinutes: number;
}

export interface SubmitWorkspaceRunInput {
  workspaceId: string;
  mode: WorkspaceRunMode;
  fromChapter: number;
  toChapter: number;
  steps: SubmitWorkspaceActivityInput[];
}

/** What the manager hands the repository — the ids, the seq and the timestamps are the repository's to stamp. */
export interface AppWorkspaceRunDraft {
  workspaceId: string;
  mode: WorkspaceRunMode;
  status: WorkspaceRunStatus;
  fromChapter: number;
  toChapter: number;
  startedAt: number | null;
  steps: WorkspaceRunStepPlan[];
  /** The sub-steps the run covers — the queue its steps work through. */
  activities: WorkspaceActivityDraft[];
}

export interface WorkspaceActivityDraft {
  stepKey: WorkspaceStepKey;
  subStepNo: number;
}

/** The fields a run's own lifecycle rewrites — its mode, range and sub-steps are fixed at submission. */
export interface AppWorkspaceRunEdit {
  status: WorkspaceRunStatus;
  steps: WorkspaceRunStepPlan[];
  startedAt: number | null;
  endedAt: number | null;
}

/** A run that has not finished — the scheduler's working set, and what blocks a second submission. */
export const ACTIVE_RUN_STATUSES = [WorkspaceRunStatus.Queued, WorkspaceRunStatus.Scheduled, WorkspaceRunStatus.Running];

export function isRunActive(run: AppWorkspaceRun): boolean {
  return ACTIVE_RUN_STATUSES.includes(run.status);
}

export function isStepFinished(step: WorkspaceRunStepPlan): boolean {
  return step.state === WorkspaceStepState.Done || step.state === WorkspaceStepState.Skipped;
}

/**
 * Why the request cannot be accepted, or undefined when it can. Shared so the
 * execute dialog can say it before submitting and the manager can refuse it after.
 *
 * `totalChapters` is the novel's chapter count, 0 when it is unknown — the range
 * is then only checked for being a range at all.
 */
export function validateRunInput(input: SubmitWorkspaceRunInput, totalChapters: number, now: number): string | undefined {
  const { fromChapter: from, toChapter: to } = input;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return 'The chapter range needs a start and an end, with the end at or after the start.';
  }
  if (totalChapters > 0 && to > totalChapters) {
    return `The novel has ${totalChapters} chapters — the range cannot end past it.`;
  }
  if (input.steps.length === 0) {
    return 'Pick at least one step to run.';
  }
  return input.mode === WorkspaceRunMode.Scheduled ? validateSchedule(input.steps, now) : undefined;
}

/**
 * A scheduled run is anchored by its first step's start time, and every later
 * booked step has to wait for the ones before it — steps run one at a time.
 */
function validateSchedule(steps: SubmitWorkspaceActivityInput[], now: number): string | undefined {
  const [first] = steps;
  if (first.startAt === null) {
    return `A scheduled run needs a start time on its first step, ${WORKSPACE_STEP_NAME[first.stepKey]}.`;
  }

  let latest = 0;
  let latestStep = first.stepKey;
  for (const step of steps) {
    if (step.startAt === null) continue;
    if (step.startAt <= now) {
      return `${WORKSPACE_STEP_NAME[step.stepKey]} is booked in the past — pick a start time from now on.`;
    }
    if (step.startAt < latest) {
      return `${WORKSPACE_STEP_NAME[step.stepKey]} cannot start before ${WORKSPACE_STEP_NAME[latestStep]}, which runs ahead of it.`;
    }
    latest = step.startAt;
    latestStep = step.stepKey;
  }

  return undefined;
}

export const APP_WORKSPACE_RUN_IPC_CHANNELS = {
  list: 'app-workspace-run:list',
  submit: 'app-workspace-run:submit',
  cancel: 'app-workspace-run:cancel',
} as const;

export interface AppWorkspaceRunApi {
  /** Every run of one workspace, newest first. */
  list(workspaceId: string): Promise<AppWorkspaceRun[]>;
  submit(input: SubmitWorkspaceRunInput): Promise<AppWorkspaceRun>;
  cancel(id: string): Promise<AppWorkspaceRun>;
}
