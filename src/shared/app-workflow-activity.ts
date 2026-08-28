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

export enum AnalyzeEngine {
  Codex = 'codex',
  Claude = 'claude',
}

export interface AnalyzeConfig {
  chapters: ChapterSelection;
  engine: AnalyzeEngine;
  resolveConflicts: boolean;
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
  /** When `false`, the orchestrator skips this activity entirely — its dependents still run once its (skipped) turn has passed. */
  enabled: boolean;
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
  enabled?: boolean;
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
  enabled?: boolean;
  config?: AppWorkflowActivityConfig;
  dependencies?: string[];
}

export interface AnalyzeOutputCharacter {
  name: string;
  aliasLabel: string;
  appearance: string;
}

export interface AnalyzeOutputGlossaryEntry {
  term: string;
  definition: string;
}

export interface AnalyzeOutputTimelineGroup {
  chapterId: string;
  scenes: string[];
}

/**
 * The Analyze activity's Output tab data — a shaped view of the world bible its pipeline builds
 * under the workflow's working directory. `characters`, `glossary` and `timeline` can each run
 * into the thousands of entries for a long novel, so they're fetched separately, paginated, via
 * `getAnalyzeCharacters`/`getAnalyzeGlossary`/`getAnalyzeTimeline` rather than embedded here.
 */
export interface AnalyzeOutput {
  summary: string;
  characterCount: number;
  glossaryCount: number;
  chaptersCovered: number;
  conflictsResolved: number;
  timelineGroupCount: number;
}

export interface AnalyzeOutputPage<T> {
  items: T[];
  total: number;
}

export enum AnalyzeStepStatus {
  Pending = 'pending',
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
}

export interface AnalyzeStep {
  key: string;
  label: string;
  status: AnalyzeStepStatus;
  detail: string | null;
}

/** The Analyze activity's in-progress state — one entry per pipeline sub-step, refreshed as its run advances. */
export interface AnalyzeProgress {
  steps: AnalyzeStep[];
  updatedAt: number;
}

export const APP_WORKFLOW_ACTIVITY_IPC_CHANNELS = {
  list: 'app-workflow-activity:list',
  create: 'app-workflow-activity:create',
  update: 'app-workflow-activity:update',
  remove: 'app-workflow-activity:remove',
  getAnalyzeOutput: 'app-workflow-activity:get-analyze-output',
  getAnalyzeProgress: 'app-workflow-activity:get-analyze-progress',
  getAnalyzeCharacters: 'app-workflow-activity:get-analyze-characters',
  getAnalyzeGlossary: 'app-workflow-activity:get-analyze-glossary',
  getAnalyzeTimeline: 'app-workflow-activity:get-analyze-timeline',
} as const;

export interface AppWorkflowActivityApi {
  list(workflowId: string): Promise<AppWorkflowActivity[]>;
  create(workflowId: string, input: CreateAppWorkflowActivityInput): Promise<AppWorkflowActivity>;
  update(workflowId: string, id: string, input: UpdateAppWorkflowActivityInput): Promise<AppWorkflowActivity>;
  remove(workflowId: string, id: string): Promise<void>;
  /** `null` when the activity isn't an Analyze activity, or its pipeline hasn't produced a world bible yet. */
  getAnalyzeOutput(workflowId: string, id: string): Promise<AnalyzeOutput | null>;
  /** `null` when the activity isn't an Analyze activity, or it has never been run. */
  getAnalyzeProgress(workflowId: string, id: string): Promise<AnalyzeProgress | null>;
  /** Paginated world-bible characters, for the Output tab's lazy-loaded Characters section. */
  getAnalyzeCharacters(workflowId: string, id: string, offset: number, limit: number): Promise<AnalyzeOutputPage<AnalyzeOutputCharacter>>;
  /** Paginated world-bible glossary, for the Output tab's lazy-loaded Glossary section. */
  getAnalyzeGlossary(workflowId: string, id: string, offset: number, limit: number): Promise<AnalyzeOutputPage<AnalyzeOutputGlossaryEntry>>;
  /** Paginated world-bible timeline, grouped by chapter, for the Output tab's lazy-loaded Timeline section. */
  getAnalyzeTimeline(workflowId: string, id: string, offset: number, limit: number): Promise<AnalyzeOutputPage<AnalyzeOutputTimelineGroup>>;
}
