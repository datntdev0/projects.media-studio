// Types and IPC contract shared between the main process, the preload bridge,
// and the renderer for the workspace entity — one preset pipeline bound to one
// library novel, stored in the `app_workspaces` / `app_workspace_steps` tables
// (see database/migrations/V0.1.1__create_app_workspaces.sql).

import type { LlmSettings } from './llm';
import type { SpeechSettings } from './app-workspace-narration';
import type { ArtStyle } from './app-workspace-illustration';

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

/** The step's display name — used by the UI and by the run validation messages main sends back. */
export const WORKSPACE_STEP_NAME: Record<WorkspaceStepKey, string> = {
  [WorkspaceStepKey.SemanticAnalysis]: 'Semantic Analysis',
  [WorkspaceStepKey.SemanticTranslate]: 'Semantic Translate',
  [WorkspaceStepKey.NarrationSpeech]: 'Narration Speech',
  [WorkspaceStepKey.FrameIllustration]: 'Frame Illustration',
  [WorkspaceStepKey.Export]: 'Export',
};

/** The steps that call an LLM, and so cannot run until the workspace has picked one. */
export const WORKSPACE_STEP_NEEDS_LLM: Record<WorkspaceStepKey, boolean> = {
  [WorkspaceStepKey.SemanticAnalysis]: true,
  [WorkspaceStepKey.SemanticTranslate]: true,
  [WorkspaceStepKey.NarrationSpeech]: false,
  [WorkspaceStepKey.FrameIllustration]: true,
  [WorkspaceStepKey.Export]: false,
};

/** Said by the run submission and by the step itself, so both name the same fix. */
export const NO_LLM_MESSAGE = 'Pick an LLM engine and model on the Semantic Analysis or Semantic Translate step before running it.';

/** What a step counts one of — a run scopes the chapter-counted steps from its chapter range. */
export enum WorkspaceStepUnit {
  Chapter = 'chapter',
  Part = 'part',
}

export const WORKSPACE_STEP_UNIT: Record<WorkspaceStepKey, WorkspaceStepUnit> = {
  [WorkspaceStepKey.SemanticAnalysis]: WorkspaceStepUnit.Chapter,
  [WorkspaceStepKey.SemanticTranslate]: WorkspaceStepUnit.Chapter,
  [WorkspaceStepKey.NarrationSpeech]: WorkspaceStepUnit.Chapter,
  [WorkspaceStepKey.FrameIllustration]: WorkspaceStepUnit.Chapter,
  [WorkspaceStepKey.Export]: WorkspaceStepUnit.Part,
};

/** Whether a step can be turned off at creation time — after that the pipeline is fixed. */
export enum StepAvailability {
  Required = 'required',
  Optional = 'optional',
  Soon = 'soon',
}

/** A step as the preset defines it, before any workspace exists. */
export interface WorkspaceStepDefinition {
  key: WorkspaceStepKey;
  idx: number;
  availability: StepAvailability;
}

export const WORKSPACE_PRESET_STEPS: Record<WorkspacePreset, WorkspaceStepDefinition[]> = {
  [WorkspacePreset.AudioNovel]: [
    { key: WorkspaceStepKey.SemanticAnalysis, idx: 1, availability: StepAvailability.Required },
    { key: WorkspaceStepKey.SemanticTranslate, idx: 2, availability: StepAvailability.Optional },
    { key: WorkspaceStepKey.NarrationSpeech, idx: 3, availability: StepAvailability.Required },
    { key: WorkspaceStepKey.FrameIllustration, idx: 4, availability: StepAvailability.Optional },
    { key: WorkspaceStepKey.Export, idx: 5, availability: StepAvailability.Required },
  ],
  [WorkspacePreset.VideoRecap]: [],
};

/** Which optional steps a new workspace runs — the pipeline is fixed after that. */
export interface WorkspaceStepToggles {
  translate: boolean;
  illustrate: boolean;
}

/** The steps a preset runs once the optional ones are toggled as given — what a workspace gets rows for. */
export function plannedStepsOf(preset: WorkspacePreset, toggles: WorkspaceStepToggles): WorkspaceStepDefinition[] {
  return WORKSPACE_PRESET_STEPS[preset].filter((step) => {
    if (step.availability === StepAvailability.Soon) return false;
    if (step.key === WorkspaceStepKey.SemanticTranslate) return toggles.translate;
    if (step.key === WorkspaceStepKey.FrameIllustration) return toggles.illustrate;
    return true;
  });
}

/**
 * One step of a workspace's pipeline, as of its latest run. The counts are in the
 * step's own unit — chapters for analysis, translation and narration, parts for
 * export — and `totalCount` stays 0 until a run scopes the step.
 */
export interface WorkspaceStepCounts {
  doneCount: number;
  failedCount: number;
  totalCount: number;
}

/** Counted progress plus the state it was counted in — a workspace's step, or a run's. */
export interface WorkspaceStepProgress extends WorkspaceStepCounts {
  state: WorkspaceStepState;
}

export interface WorkspaceStep extends WorkspaceStepProgress {
  key: WorkspaceStepKey;
  idx: number;
}

export interface AppWorkspace {
  id: string;
  name: string;
  description: string;
  preset: WorkspacePreset;
  libraryId: string;
  status: WorkspaceStatus;
  /** The LLM its steps call, or null until one is picked — config.json names models, never an engine. */
  llm: LlmSettings | null;
  /** The voice and pace Narration Speech reads with — every workspace starts on the step's defaults. */
  speech: SpeechSettings;
  /** The style Frame Illustration draws in, which scopes the images it writes. */
  artStyle: ArtStyle;
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
  llm: LlmSettings | null;
  speech: SpeechSettings;
  artStyle: ArtStyle;
  steps: WorkspaceStep[];
  lastRunAt: number | null;
}

/** The fields a workspace's own listing can rewrite — its preset, novel and pipeline are fixed at creation. */
export interface AppWorkspaceEdit {
  name: string;
  description: string;
}

/** A step's run-driven fields — its key and position belong to the preset. */
export interface WorkspaceStepEdit {
  state: WorkspaceStepState;
  doneCount: number;
  failedCount: number;
  totalCount: number;
}

/** What a caller asks for when adding a workspace — the manager builds the steps and the status. */
export interface CreateAppWorkspaceInput {
  name: string;
  description: string;
  preset: WorkspacePreset;
  libraryId: string;
  translateEnabled: boolean;
  illustrateEnabled: boolean;
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
