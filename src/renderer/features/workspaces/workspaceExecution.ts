import type { WorkspaceStepKey } from '@/shared/app-workspace';

// What the execute dialog produces. Nothing submits it to the main process yet —
// the runner does not exist — so these types stay in the renderer for now.

export enum ExecutionMode {
  Immediate = 'immediate',
  Scheduled = 'scheduled',
}

export enum StepStartMode {
  AfterPrevious = 'after-previous',
  AtTime = 'at-time',
}

/** How one step of the pipeline takes part in this execution. */
export interface ExecutionStepPlan {
  key: WorkspaceStepKey;
  enabled: boolean;
  startMode: StepStartMode;
  /** A `datetime-local` value in the user's own timezone — only read with StepStartMode.AtTime. */
  startAt: string;
  /** Attempts per sub-step after the first failure, 0 for none. */
  retries: number;
  retryDelayMinutes: number;
}

export interface WorkspaceExecutionRequest {
  mode: ExecutionMode;
  fromChapter: number;
  toChapter: number;
  /** When the workspace itself starts — only read with ExecutionMode.Scheduled. */
  startAt: string;
  steps: ExecutionStepPlan[];
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

/** The default schedule the dialog opens with — tomorrow at 02:00, the quiet hours a long run wants. */
export function defaultScheduleStart(now: Date = new Date()): string {
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  start.setHours(2, 0, 0, 0);
  return toDateTimeInputValue(start);
}

/** One line summarising a submitted request, for the notice the detail screen shows. */
export function describeRequest(request: WorkspaceExecutionRequest): string {
  const when = request.mode === ExecutionMode.Immediate ? 'start now' : `scheduled ${request.startAt.replace('T', ' ')}`;
  const steps = request.steps.filter((plan) => plan.enabled).length;
  return `${when} · ch. ${request.fromChapter}–${request.toChapter} · ${steps} step${steps === 1 ? '' : 's'}`;
}
