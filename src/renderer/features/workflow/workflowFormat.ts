import { AppWorkflowStatus } from '../../../shared/app-workflow';
import { AppWorkflowRunStatus } from '../../../shared/app-workflow-history';

export const STATUS_LABEL: Record<AppWorkflowStatus, string> = {
  [AppWorkflowStatus.Draft]: 'Draft',
  [AppWorkflowStatus.Active]: 'Active',
  [AppWorkflowStatus.Running]: 'Running',
  [AppWorkflowStatus.Failed]: 'Failed',
};

export const STATUS_TAG_CLASS: Record<AppWorkflowStatus, string> = {
  [AppWorkflowStatus.Draft]: 'tag-outline',
  [AppWorkflowStatus.Active]: 'tag-accent',
  [AppWorkflowStatus.Running]: 'tag-accent',
  [AppWorkflowStatus.Failed]: 'tag-outline',
};

/** `Running`/`Failed` are set by the run pipeline itself — not a user's choice, so the edit dialog's status picker excludes them. */
export const EDITABLE_STATUSES = [AppWorkflowStatus.Draft, AppWorkflowStatus.Active];

export const RUN_STATUS_LABEL: Record<AppWorkflowRunStatus, string> = {
  [AppWorkflowRunStatus.Running]: 'Running',
  [AppWorkflowRunStatus.Success]: 'Success',
  [AppWorkflowRunStatus.Failed]: 'Failed',
  [AppWorkflowRunStatus.Skipped]: 'Skipped',
};

export const RUN_STATUS_TAG_CLASS: Record<AppWorkflowRunStatus, string> = {
  [AppWorkflowRunStatus.Running]: 'tag-accent',
  [AppWorkflowRunStatus.Success]: 'tag-primary',
  [AppWorkflowRunStatus.Failed]: 'tag-outline',
  [AppWorkflowRunStatus.Skipped]: 'tag-outline',
};

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
