import { WorkspaceRunMode, type SubmitWorkspaceActivityInput, type SubmitWorkspaceRunInput } from '@/shared/app-workspace-run';
import type { WorkspaceStepKey } from '@/shared/app-workspace';

// The execute dialog's own form state, and how it turns into the request main takes.
// A scheduled run carries no start time of its own — each step brings its own.

export enum StepStartMode {
  /** Runs as soon as the step ahead of it completes. */
  AfterPrevious = 'after-previous',
  AtTime = 'at-time',
}

export interface ExecutionStepPlan {
  key: WorkspaceStepKey;
  enabled: boolean;
  startMode: StepStartMode;
  /** A `datetime-local` value in the user's own timezone — only read with StepStartMode.AtTime. */
  startAt: string;
  retries: number;
  retryDelayMinutes: number;
}

export const RETRY_OPTIONS = [3, 2, 1, 0];
export const RETRY_DELAY_OPTIONS = [1, 5, 15];

export function retryLabelOf(retries: number): string {
  return retries === 0 ? 'None' : `${retries}×`;
}

/** A `datetime-local` value for the given moment, in the user's own timezone. */
export function toDateTimeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The time a step's picker opens on — the quiet hours a long run wants, `hoursApart` after the step ahead of it. */
export function defaultStepStart(previous: string | undefined, hoursApart = 2): string {
  if (previous) return toDateTimeInputValue(new Date(new Date(previous).getTime() + hoursApart * 3_600_000));
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(2, 0, 0, 0);
  return toDateTimeInputValue(start);
}

function startAtOf(plan: ExecutionStepPlan, mode: WorkspaceRunMode): number | null {
  if (mode === WorkspaceRunMode.Immediate || plan.startMode === StepStartMode.AfterPrevious) return null;
  const parsed = new Date(plan.startAt).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/** The form as main takes it: the included steps only, each with the start time it booked. */
export function toRunInput(workspaceId: string, mode: WorkspaceRunMode, from: string, to: string, plans: ExecutionStepPlan[]): SubmitWorkspaceRunInput {
  const steps: SubmitWorkspaceActivityInput[] = plans
    .filter((plan) => plan.enabled)
    .map((plan) => ({ stepKey: plan.key, startAt: startAtOf(plan, mode), retries: plan.retries, retryDelayMinutes: plan.retryDelayMinutes }));

  return { workspaceId, mode, fromChapter: Number(from), toChapter: Number(to), steps };
}

/**
 * Why the form cannot be submitted yet, beyond what `validateRunInput` covers —
 * a step asked to start at a time the picker has not been given.
 */
export function missingStartTimeOf(mode: WorkspaceRunMode, plans: ExecutionStepPlan[]): string | undefined {
  if (mode === WorkspaceRunMode.Immediate) return undefined;
  const missing = plans.some((plan) => plan.enabled && plan.startMode === StepStartMode.AtTime && plan.startAt === '');
  return missing ? 'A step set to start at a time needs that time.' : undefined;
}
