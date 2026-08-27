import { AppWorkflowStatus } from '../../../shared/app-workflow';

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
