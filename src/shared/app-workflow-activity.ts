// Types and IPC contract for a workflow's activity nodes — the canvas
// builder's boxes. Each activity belongs to exactly one workflow and holds
// one of five type-specific config blocks (exactly one set, matching
// `type`), mirroring how `app_library_contents.content` holds its own
// type-specific block.

import { ContentLanguage } from './app-library-content';

export enum AppWorkflowActivityType {
  Analyze = 'analyze',
  Translate = 'translate',
  Profiles = 'profiles',
  Storyboard = 'storyboard',
  Tts = 'tts',
}

export enum ActivityChapterScope {
  All = 'all',
  Missing = 'missing',
  Range = 'range',
  Picked = 'picked',
}

/** Which chapters an activity acts on — shared by every type that operates over a chapter range. */
export interface ChapterSelection {
  scope: ActivityChapterScope;
  rangeFrom: number;
  rangeTo: number;
  pickedContentIds: string[];
}

export interface AnalyzeConfig {
  chapters: ChapterSelection;
}

export interface TranslateConfig {
  chapters: ChapterSelection;
  language: ContentLanguage;
}

export interface ProfilesConfig {
  style: string;
}

export interface StoryboardConfig {
  chapters: ChapterSelection;
  style: string;
}

export interface TtsConfig {
  chapters: ChapterSelection;
  voice: string;
  pace: string;
  language: ContentLanguage;
}

export type AppWorkflowActivityConfig = AnalyzeConfig | TranslateConfig | ProfilesConfig | StoryboardConfig | TtsConfig;

/** A node on a workflow's canvas. Exactly one of the five config fields is set, matching `type`. `dependencies` holds the ids of other activities on the same workflow that must complete before this one runs. */
export interface AppWorkflowActivity {
  id: string;
  workflowId: string;
  type: AppWorkflowActivityType;
  name: string;
  description: string;
  x: number;
  y: number;
  retry: number;
  delay: number;
  analyzeConfig: AnalyzeConfig | null;
  translateConfig: TranslateConfig | null;
  profilesConfig: ProfilesConfig | null;
  storyboardConfig: StoryboardConfig | null;
  ttsConfig: TtsConfig | null;
  dependencies: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateAppWorkflowActivityInput {
  type: AppWorkflowActivityType;
  name: string;
  description?: string;
  x: number;
  y: number;
  retry?: number;
  delay?: number;
  config: AppWorkflowActivityConfig;
  dependencies?: string[];
}

/** An activity's type can't change after creation, so this is everything else in `CreateAppWorkflowActivityInput`. */
export interface UpdateAppWorkflowActivityInput {
  name?: string;
  description?: string;
  x?: number;
  y?: number;
  retry?: number;
  delay?: number;
  config?: AppWorkflowActivityConfig;
  dependencies?: string[];
}

export const APP_WORKFLOW_ACTIVITY_IPC_CHANNELS = {
  list: 'app-workflow-activity:list',
  create: 'app-workflow-activity:create',
  update: 'app-workflow-activity:update',
  remove: 'app-workflow-activity:remove',
} as const;

export interface AppWorkflowActivityApi {
  list(workflowId: string): Promise<AppWorkflowActivity[]>;
  create(workflowId: string, input: CreateAppWorkflowActivityInput): Promise<AppWorkflowActivity>;
  update(workflowId: string, id: string, input: UpdateAppWorkflowActivityInput): Promise<AppWorkflowActivity>;
  remove(workflowId: string, id: string): Promise<void>;
}
