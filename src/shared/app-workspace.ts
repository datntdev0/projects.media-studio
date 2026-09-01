// Types and IPC contract shared between the main process, the preload bridge,
// and the renderer for the workspace entity — one preset pipeline bound to one
// library novel, stored in the `app_workspaces` / `app_workspace_steps` tables
// (see database/migrations/V0.1.1__create_app_workspaces.sql).

export enum WorkspacePreset {
  AudioNovel = 'audio-novel',
  VideoRecap = 'video-recap',
}

export enum WorkspaceStepKey {
  SemanticAnalysis = 'semantic-analysis',
  SemanticTranslate = 'semantic-translate',
  NarrationSpeech = 'narration-speech',
  FrameIllustration = 'frame-illustration',
  Export = 'export',
}

export enum WorkspaceStepState {
  Pending = 'pending',
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
  Skipped = 'skipped',
}

export enum WorkspaceStatus {
  Draft = 'draft',
  Scheduled = 'scheduled',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

/** Whether a step can be turned off at creation time — after that the pipeline is fixed. */
export enum StepAvailability {
  Required = 'required',
  Optional = 'optional',
  Soon = 'soon',
}

/** A step as the preset defines it, before any workspace exists. */
export interface WorkspaceStepDefinition {
  key: WorkspaceStepKey;
  /** Position in the preset, kept even when an earlier step is left off. */
  idx: number;
  availability: StepAvailability;
}

export const WORKSPACE_PRESET_STEPS: Record<WorkspacePreset, WorkspaceStepDefinition[]> = {
  [WorkspacePreset.AudioNovel]: [
    { key: WorkspaceStepKey.SemanticAnalysis, idx: 1, availability: StepAvailability.Required },
    { key: WorkspaceStepKey.SemanticTranslate, idx: 2, availability: StepAvailability.Optional },
    { key: WorkspaceStepKey.NarrationSpeech, idx: 3, availability: StepAvailability.Required },
    { key: WorkspaceStepKey.FrameIllustration, idx: 4, availability: StepAvailability.Soon },
    { key: WorkspaceStepKey.Export, idx: 5, availability: StepAvailability.Required },
  ],
  [WorkspacePreset.VideoRecap]: [],
};

/** The steps a preset runs once the optional ones are toggled as given — what a workspace gets rows for. */
export function plannedStepsOf(preset: WorkspacePreset, translateEnabled: boolean): WorkspaceStepDefinition[] {
  return WORKSPACE_PRESET_STEPS[preset].filter((step) => {
    if (step.availability === StepAvailability.Soon) return false;
    if (step.key === WorkspaceStepKey.SemanticTranslate) return translateEnabled;
    return true;
  });
}

/**
 * One step of a workspace's pipeline, as of its latest run. The counts are in the
 * step's own unit — chapters for analysis, translation and narration, parts for
 * export — and `totalCount` stays 0 until a run scopes the step.
 */
export interface WorkspaceStep {
  key: WorkspaceStepKey;
  idx: number;
  state: WorkspaceStepState;
  doneCount: number;
  failedCount: number;
  totalCount: number;
}

export interface AppWorkspace {
  id: string;
  name: string;
  description: string;
  preset: WorkspacePreset;
  /** The library novel this workspace runs over — the novel itself stays in the library. */
  libraryId: string;
  status: WorkspaceStatus;
  /** In `idx` order, and only the steps the preset actually runs. */
  steps: WorkspaceStep[];
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** What a caller hands over to create a workspace — the id and the dates are the repository's to stamp. */
export interface AppWorkspaceDraft {
  name: string;
  description: string;
  preset: WorkspacePreset;
  libraryId: string;
  status: WorkspaceStatus;
  steps: WorkspaceStep[];
  lastRunAt: number | null;
}

/** The fields a workspace's own listing can rewrite — its preset, novel and pipeline are fixed at creation. */
export interface AppWorkspaceEdit {
  name: string;
  description: string;
}

/** What a caller asks for when adding a workspace — the manager builds the steps and the status. */
export interface CreateAppWorkspaceInput {
  name: string;
  description: string;
  preset: WorkspacePreset;
  libraryId: string;
  translateEnabled: boolean;
}

/** What a caller asks to change — a field left out keeps its current value. */
export interface UpdateAppWorkspaceInput {
  name?: string;
  description?: string;
}

export interface ListAppWorkspacesFilter {
  status?: WorkspaceStatus;
  preset?: WorkspacePreset;
}

export const APP_WORKSPACE_IPC_CHANNELS = {
  list: 'app-workspace:list',
  get: 'app-workspace:get',
  create: 'app-workspace:create',
  update: 'app-workspace:update',
  remove: 'app-workspace:remove',
} as const;

export interface AppWorkspaceApi {
  list(filter?: ListAppWorkspacesFilter): Promise<AppWorkspace[]>;
  get(id: string): Promise<AppWorkspace | null>;
  create(input: CreateAppWorkspaceInput): Promise<AppWorkspace>;
  update(id: string, input: UpdateAppWorkspaceInput): Promise<AppWorkspace>;
  remove(id: string): Promise<void>;
}
