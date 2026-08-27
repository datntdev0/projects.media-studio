// Types and IPC contract shared between the main process, the preload
// bridge, and the renderer for the workflow entity — stored locally in the
// `app_workflows` SQLite table. A workflow pairs a name/description/status
// with the library item it operates on; the library reference (and its
// denormalized type/title, so the listing needs no join) is fixed at
// creation, following the same convention as `ScrapingJob`.

import type { AppLibraryType } from './app-library';

export enum AppWorkflowStatus {
  Draft = 'draft',
  Active = 'active',
}

/** A row of the workflow listing. */
export interface AppWorkflow {
  id: string;
  name: string;
  description: string;
  status: AppWorkflowStatus;
  libraryId: string;
  libraryType: AppLibraryType;
  libraryTitle: string;
  createdAt: number;
  updatedAt: number;
}

/** What a caller hands over to create or fully replace a workflow — the id and the dates are the repository's to stamp. */
export interface AppWorkflowDraft {
  name: string;
  description: string;
  status: AppWorkflowStatus;
  libraryId: string;
  libraryType: AppLibraryType;
  libraryTitle: string;
}

/** What the repository itself narrows a listing by: two columns, equality only. */
export interface ListAppWorkflowsFilter {
  status?: AppWorkflowStatus;
  libraryType?: AppLibraryType;
}

/** What a caller asks for when creating a workflow — the manager resolves libraryType/libraryTitle from the library itself. */
export interface CreateAppWorkflowInput {
  name: string;
  description: string;
  status?: AppWorkflowStatus;
  libraryId: string;
}

/** A workflow's library can't change after creation, so this is everything else in `CreateAppWorkflowInput`. */
export interface UpdateAppWorkflowInput {
  name?: string;
  description?: string;
  status?: AppWorkflowStatus;
}

export const APP_WORKFLOW_IPC_CHANNELS = {
  list: 'app-workflow:list',
  get: 'app-workflow:get',
  create: 'app-workflow:create',
  update: 'app-workflow:update',
  remove: 'app-workflow:remove',
} as const;

export interface AppWorkflowApi {
  list(filter?: ListAppWorkflowsFilter): Promise<AppWorkflow[]>;
  get(id: string): Promise<AppWorkflow | null>;
  create(input: CreateAppWorkflowInput): Promise<AppWorkflow>;
  update(id: string, input: UpdateAppWorkflowInput): Promise<AppWorkflow>;
  remove(id: string): Promise<void>;
}
