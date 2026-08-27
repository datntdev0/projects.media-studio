// Types and IPC contract for a workflow's run history — stored in the
// `app_workflow_history` table. Each run writes one overview row
// (`activityId` null) plus one row per activity execution (`activityId`
// set), all sharing the same `runId`.

import type { AppWorkflowActivityType } from './app-workflow-activity';

export enum AppWorkflowRunStatus {
  Running = 'running',
  Success = 'success',
  Failed = 'failed',
}

export interface AppWorkflowHistoryEntry {
  id: string;
  workflowId: string;
  runId: string;
  activityId: string | null;
  activityName: string | null;
  activityType: AppWorkflowActivityType | null;
  status: AppWorkflowRunStatus;
  range: string | null;
  error: string | null;
  startedAt: number;
  endedAt: number | null;
  duration: number | null;
  createdAt: number;
  updatedAt: number;
}

/** One run of a workflow: the overview entry plus every activity entry recorded under the same `runId`, in execution order. */
export interface AppWorkflowRun {
  runId: string;
  overview: AppWorkflowHistoryEntry;
  activities: AppWorkflowHistoryEntry[];
}

export const APP_WORKFLOW_HISTORY_IPC_CHANNELS = {
  listRuns: 'app-workflow-history:list-runs',
} as const;

export interface AppWorkflowHistoryApi {
  listRuns(workflowId: string): Promise<AppWorkflowRun[]>;
}
