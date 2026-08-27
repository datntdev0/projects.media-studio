import { AppWorkflowStatus } from '../../../shared/app-workflow';

export const STATUS_LABEL: Record<AppWorkflowStatus, string> = {
  [AppWorkflowStatus.Draft]: 'Draft',
  [AppWorkflowStatus.Active]: 'Active',
};

export const STATUS_TAG_CLASS: Record<AppWorkflowStatus, string> = {
  [AppWorkflowStatus.Draft]: 'tag-outline',
  [AppWorkflowStatus.Active]: 'tag-accent',
};
