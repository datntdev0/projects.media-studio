// Types and IPC contract for what the Semantic Translate step produces. Like the
// extractions it is derived from, it lives on disk under the workspace's own
// working directory (see helpers/paths.ts):
//
//   appDir/data/workspaces/<slug>/translations/vi/
//   ├── world.vi.json          extractions/world.json translated, section by section
//   ├── chapter-0001.vi.json   one chapter's extraction with the translations of world.vi.json applied
//   └── chapter-0001.vi.txt    the chapter's text translated against that metadata
//
// The world translation is what the step's screen edits; the chapter metadata is
// distributed from it in code and never edited by hand; the chapter text is the
// step's own output, editable from the screen's chapter tab.

import { ContentLanguage } from './app-library-content';
import type { CharacterRelationship, CharacterWeight, WorldBible } from './app-workspace-extraction';
import type { LlmOptions, LlmSettings } from './llm';

/** The one target language a workspace translates into today. */
export const TRANSLATION_LANGUAGE = ContentLanguage.Vietnamese;

export const LANGUAGE_NAME: Record<ContentLanguage, string> = {
  [ContentLanguage.Vietnamese]: 'Vietnamese',
  [ContentLanguage.English]: 'English',
  [ContentLanguage.Chinese]: 'Chinese',
};

/** A name as the translation renders it, paired with the original it stands for. */
export interface TranslatedName {
  name: string;
  nameOriginal: string;
}

export interface TranslatedGlossaryTerm {
  termOriginal: string;
  term: string;
  category: string;
  definition: string;
}

/** A chapter's character with every string translated — the shape a chapter's translation prompt reads. */
export interface ChapterTranslationCharacter extends TranslatedName {
  alias: TranslatedName[];
  weight: CharacterWeight;
  body: string;
  appearance: string;
  relationships: CharacterRelationship[];
}

export interface ChapterTranslationTimeline {
  /** `timelineYYYY`, as the chapter's extraction numbers it. */
  idx: string;
  context: string;
  summary: string;
  participants: string[];
}

/** One `chapter-XXXX.vi.json` in full. */
export interface ChapterTranslation {
  chapterIdx: string;
  /** Translated by the step along with the chapter's text — '' until then. */
  chapterTitle: string;
  chapterTitleOriginal: string;
  characters: ChapterTranslationCharacter[];
  timelines: ChapterTranslationTimeline[];
  glossary: TranslatedGlossaryTerm[];
}

/** A world-bible character translated, keyed exactly as the original is so the two can be read side by side. */
export interface WorldTranslationCharacter extends TranslatedName {
  alias: TranslatedName[];
  weight: CharacterWeight;
  body: string;
  appearance: Record<string, string>;
  relationships: Record<string, CharacterRelationship[]>;
}

export interface WorldTranslationTimeline {
  /** `chapterXXXX-timelineYYYY`, the same id as the original timeline. */
  idx: string;
  context: string;
  summary: string;
  participants: string[];
}

export interface WorldTranslatedGlossaryTerm extends TranslatedGlossaryTerm {
  chapterCount: number;
}

/** `world.vi.json` in full — the world bible translated. */
export interface WorldTranslation {
  characters: WorldTranslationCharacter[];
  timelines: WorldTranslationTimeline[];
  glossary: WorldTranslatedGlossaryTerm[];
}

/** One of the novel's chapters and how far the translation has got with it. */
export interface WorkspaceTranslationChapter {
  idx: number;
  title: string;
  /** Whether Semantic Analysis has extracted it — nothing can be translated before that. */
  extracted: boolean;
  /** Whether its `chapter-XXXX.vi.json` has been distributed. */
  distributed: boolean;
  /** Whether its text has been translated. */
  translated: boolean;
}

/** The world translation as the step's screen reads it, beside the original it translates. */
export interface WorkspaceTranslationState {
  /** Null until the metadata has been translated. */
  world: WorldTranslation | null;
  /** The world bible the translation is of, or null until Semantic Analysis has run. */
  source: WorldBible | null;
  chapters: WorkspaceTranslationChapter[];
  /** When `world.vi.json` was last written, epoch ms, or null when there is none. */
  updatedAt: number | null;
  /** When a chapter's metadata was last distributed, epoch ms, or null when none has been. */
  distributedAt: number | null;
  /** What the step will call, or null until the workspace has picked an engine and model. */
  llm: LlmSettings | null;
  /** What the pickers may offer, from config.json. */
  llmOptions: LlmOptions;
}

/** One chapter as the screen's content tab shows it: the source beside its translation. */
export interface WorkspaceChapterTranslation {
  idx: number;
  title: string;
  /** The translated title, or '' until the chapter has been translated. */
  titleTranslated: string;
  /** The chapter's text from the working copy, or '' when the workspace has never been executed. */
  source: string;
  /** The translated text, or null until the step has translated it. */
  translated: string | null;
}

export const APP_WORKSPACE_TRANSLATION_IPC_CHANNELS = {
  read: 'app-workspace-translation:read',
  save: 'app-workspace-translation:save',
  translateMetadata: 'app-workspace-translation:translate-metadata',
  distribute: 'app-workspace-translation:distribute',
  readChapter: 'app-workspace-translation:read-chapter',
  saveChapter: 'app-workspace-translation:save-chapter',
} as const;

export interface AppWorkspaceTranslationApi {
  /** One workspace's `world.vi.json`, as it stands on disk, with the world bible it translates. */
  read(workspaceId: string): Promise<WorkspaceTranslationState>;
  /** Overwrites `world.vi.json` with the edited translation. Nothing is distributed. */
  save(workspaceId: string, world: WorldTranslation): Promise<WorkspaceTranslationState>;
  /** Asks the LLM for whatever `world.json` has that `world.vi.json` does not yet, keeping every edit. */
  translateMetadata(workspaceId: string): Promise<WorkspaceTranslationState>;
  /** Rewrites every extracted chapter's `chapter-XXXX.vi.json` from `world.vi.json`. */
  distribute(workspaceId: string): Promise<WorkspaceTranslationState>;
  readChapter(workspaceId: string, chapterNo: number): Promise<WorkspaceChapterTranslation>;
  /** Overwrites a chapter's translated text with an edit. */
  saveChapter(workspaceId: string, chapterNo: number, body: string): Promise<WorkspaceChapterTranslation>;
}
