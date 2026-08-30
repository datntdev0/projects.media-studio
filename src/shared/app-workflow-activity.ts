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
  ExportVideo = 'export-video',
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
  /** When `false`, the merge step skips the LLM call that writes `world.json`'s `overview.summary`. */
  generateSummary: boolean;
}

export interface TranslateConfig {
  chapters: ChapterSelection;
  engine: AnalyzeEngine;
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

/** Scheme the renderer plays bundled TTS voice-sample clips through (see src/main/helpers/protocols/tts-sample.protocol.ts). */
export const TTS_SAMPLE_PROTOCOL = 'app-tts-sample';

export interface ExportVideoConfig {
  chapters: ChapterSelection;
  voice: string;
  /** `app-export-video-image://` URL of the uploaded static image, or `null` before one is picked. */
  imageFile: string | null;
  /** When `true`, the worker overlays a sound-wave visualization of the narration at the bottom center of the exported video. */
  soundWave: boolean;
}

export type AppWorkflowActivityConfig = AnalyzeConfig | TranslateConfig | ProfilesConfig | StoryboardConfig | TtsConfig | ExportVideoConfig;

/** A node on a workflow's canvas. Exactly one of the six config fields is set, matching `type`. `dependencies` holds the ids of other activities on the same workflow that must complete before this one runs. */
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
  exportVideoConfig: ExportVideoConfig | null;
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

/** One lazily-fetched page of a pipeline activity's Output tab data — world-bible entries for Analyze, translated chapters for Translate. */
export interface PipelineOutputPage<T> {
  items: T[];
  total: number;
}

export enum PipelineStepStatus {
  Pending = 'pending',
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
}

export interface PipelineStep {
  key: string;
  label: string;
  status: PipelineStepStatus;
  detail: string | null;
}

/** A script-driven activity's (Analyze, Translate) in-progress state — one entry per pipeline sub-step, refreshed as its run advances. Shared by every activity type whose executor runs a multi-step, resumable pipeline against the workflow's working directory. */
export interface PipelineProgress {
  steps: PipelineStep[];
  updatedAt: number;
}

export interface TranslateOutputChapter {
  chapterId: string;
  idx: number;
  title: string;
  wordCount: number;
}

/**
 * The Translate activity's Output tab data — counts from its working directory
 * (`translation/<language>/` under the workflow's export dir). The translated chapter list itself
 * is fetched separately, paginated, via `getTranslateChapters`, and one chapter's full translated
 * text is fetched on demand via `getTranslateChapterText`.
 */
export interface TranslateOutput {
  language: ContentLanguage;
  totalChapters: number;
  glossaryTranslated: boolean;
  chaptersTranslated: number;
}

/** Scheme the renderer plays a workflow's generated per-chapter narration clips through (see src/main/helpers/protocols/tts-output.protocol.ts). */
export const TTS_OUTPUT_PROTOCOL = 'app-tts-output';

export interface TtsOutputChapter {
  chapterId: string;
  idx: number;
  title: string;
  durationSec: number;
  /** `app-tts-output://` URL the Output tab's `<audio>` element plays this chapter's narration through. */
  audioUrl: string;
}

/**
 * The Tts activity's Output tab data — counts from its working directory (`tts/<language>/` under
 * the workflow's export dir). The narrated chapter list itself is fetched separately, paginated, via
 * `getTtsChapters`, and one chapter's srt is fetched on demand via `getTtsChapterSrt`.
 */
export interface TtsOutput {
  language: ContentLanguage;
  voice: string;
  pace: string;
  totalChapters: number;
  chaptersGenerated: number;
}

/** Scheme the renderer plays a workflow's generated per-chapter (and final combined) export videos through (see src/main/helpers/protocols/export-video-output.protocol.ts). */
export const EXPORT_VIDEO_OUTPUT_PROTOCOL = 'app-export-video-output';

/** Scheme the renderer previews a workflow's uploaded export-video source image through (see src/main/helpers/protocols/export-video-image.protocol.ts). */
export const EXPORT_VIDEO_IMAGE_PROTOCOL = 'app-export-video-image';

export interface ExportVideoOutputChapter {
  chapterId: string;
  idx: number;
  title: string;
  durationSec: number;
  /** `app-export-video-output://` URL the Output tab's `<video>` element plays this chapter's clip through. */
  videoUrl: string;
}

/**
 * The Export Video activity's Output tab data — counts from its working directory
 * (`export-video/<activityId>/` under the workflow's export dir). Chapters are exported one at
 * a time (resumable — an existing chapter clip is skipped on re-run), then combined into one
 * final video once every exported chapter is ready. The per-chapter clip list itself is fetched
 * separately, paginated, via `getExportVideoChapters`; a chapter's srt via `getExportVideoChapterSrt`,
 * and the final video's unified srt via `getExportVideoSrt`.
 */
export interface ExportVideoOutput {
  voice: string;
  totalChapters: number;
  chaptersExported: number;
  /** `app-export-video-output://` URL of the final combined video, or `null` until the combine step has run. */
  videoUrl: string | null;
}

export const APP_WORKFLOW_ACTIVITY_IPC_CHANNELS = {
  list: 'app-workflow-activity:list',
  create: 'app-workflow-activity:create',
  update: 'app-workflow-activity:update',
  remove: 'app-workflow-activity:remove',
  getAnalyzeOutput: 'app-workflow-activity:get-analyze-output',
  getPipelineProgress: 'app-workflow-activity:get-pipeline-progress',
  getAnalyzeCharacters: 'app-workflow-activity:get-analyze-characters',
  getAnalyzeGlossary: 'app-workflow-activity:get-analyze-glossary',
  getAnalyzeTimeline: 'app-workflow-activity:get-analyze-timeline',
  getTranslateOutput: 'app-workflow-activity:get-translate-output',
  getTranslateChapters: 'app-workflow-activity:get-translate-chapters',
  getTranslateChapterText: 'app-workflow-activity:get-translate-chapter-text',
  getTtsOutput: 'app-workflow-activity:get-tts-output',
  getTtsChapters: 'app-workflow-activity:get-tts-chapters',
  getTtsChapterSrt: 'app-workflow-activity:get-tts-chapter-srt',
  getExportVideoOutput: 'app-workflow-activity:get-export-video-output',
  getExportVideoChapters: 'app-workflow-activity:get-export-video-chapters',
  getExportVideoChapterSrt: 'app-workflow-activity:get-export-video-chapter-srt',
  getExportVideoSrt: 'app-workflow-activity:get-export-video-srt',
  uploadExportVideoImage: 'app-workflow-activity:upload-export-video-image',
} as const;

export interface AppWorkflowActivityApi {
  list(workflowId: string): Promise<AppWorkflowActivity[]>;
  create(workflowId: string, input: CreateAppWorkflowActivityInput): Promise<AppWorkflowActivity>;
  update(workflowId: string, id: string, input: UpdateAppWorkflowActivityInput): Promise<AppWorkflowActivity>;
  remove(workflowId: string, id: string): Promise<void>;
  /** `null` when the activity isn't an Analyze activity, or its pipeline hasn't produced a world bible yet. */
  getAnalyzeOutput(workflowId: string, id: string): Promise<AnalyzeOutput | null>;
  /** `null` when the activity isn't a script-driven pipeline (Analyze, Translate), or it has never been run. */
  getPipelineProgress(workflowId: string, id: string): Promise<PipelineProgress | null>;
  /** Paginated world-bible characters, for the Output tab's lazy-loaded Characters section. */
  getAnalyzeCharacters(workflowId: string, id: string, offset: number, limit: number): Promise<PipelineOutputPage<AnalyzeOutputCharacter>>;
  /** Paginated world-bible glossary, for the Output tab's lazy-loaded Glossary section. */
  getAnalyzeGlossary(workflowId: string, id: string, offset: number, limit: number): Promise<PipelineOutputPage<AnalyzeOutputGlossaryEntry>>;
  /** Paginated world-bible timeline, grouped by chapter, for the Output tab's lazy-loaded Timeline section. */
  getAnalyzeTimeline(workflowId: string, id: string, offset: number, limit: number): Promise<PipelineOutputPage<AnalyzeOutputTimelineGroup>>;
  /** `null` when the activity isn't a Translate activity, or its pipeline hasn't translated any chapter yet. */
  getTranslateOutput(workflowId: string, id: string): Promise<TranslateOutput | null>;
  /** Paginated translated chapters, for the Output tab's lazy-loaded Translated Chapters section. */
  getTranslateChapters(workflowId: string, id: string, offset: number, limit: number): Promise<PipelineOutputPage<TranslateOutputChapter>>;
  /** One chapter's full translated text, fetched on demand when its Output tab row is expanded. `null` if it hasn't been translated. */
  getTranslateChapterText(workflowId: string, id: string, chapterId: string): Promise<string | null>;
  /** `null` when the activity isn't a Tts activity, or its pipeline hasn't narrated any chapter yet. */
  getTtsOutput(workflowId: string, id: string): Promise<TtsOutput | null>;
  /** Paginated narrated chapters, for the Output tab's lazy-loaded Narrated Chapters section. */
  getTtsChapters(workflowId: string, id: string, offset: number, limit: number): Promise<PipelineOutputPage<TtsOutputChapter>>;
  /** One chapter's srt subtitles, fetched on demand when its Output tab row is expanded. `null` if it hasn't been narrated. */
  getTtsChapterSrt(workflowId: string, id: string, chapterId: string): Promise<string | null>;
  /** `null` when the activity isn't an Export Video activity, or it hasn't exported any chapter yet. */
  getExportVideoOutput(workflowId: string, id: string): Promise<ExportVideoOutput | null>;
  /** Paginated exported per-chapter clips, for the Output tab's lazy-loaded Exported Chapters section. */
  getExportVideoChapters(workflowId: string, id: string, offset: number, limit: number): Promise<PipelineOutputPage<ExportVideoOutputChapter>>;
  /** One chapter's srt subtitles, fetched on demand when its Output tab row is expanded. `null` if it hasn't been exported. */
  getExportVideoChapterSrt(workflowId: string, id: string, chapterId: string): Promise<string | null>;
  /** The final combined video's unified srt, fetched on demand. `null` until the combine step has run. */
  getExportVideoSrt(workflowId: string, id: string): Promise<string | null>;
  /** Saves a locally picked source image into the workflow's working directory and returns the `app-export-video-image://` URL its `imageFile` config can be set to. */
  uploadExportVideoImage(workflowId: string, fileName: string, contentType: string, data: ArrayBuffer): Promise<string>;
}
