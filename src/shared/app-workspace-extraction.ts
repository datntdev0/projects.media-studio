// Types and IPC contract for what the Semantic Analysis step produces. Unlike
// every other workspace feature these live on disk rather than in SQLite, under
// the workspace's own working directory (see helpers/paths.ts):
//
//   appDir/data/workspaces/<slug>/extractions/
//   ├── chapter-0001.json   one chapter as the LLM extracted it
//   ├── chapter-0002.json
//   └── world.json          every chapter merged into one world bible
//
// A chapter file is written by the step's handler and never edited by hand; the
// world bible is merged from them in code, and is what the step's screen edits.

import type { LlmOptions, LlmSettings } from './llm';

/** How much of the story a character carries — merged as the strongest reading across chapters. */
export enum CharacterWeight {
  Main = 'main',
  Supporting = 'supporting',
  Minor = 'minor',
}

/** Strongest first, so merging two readings of the same character is a matter of taking the lower index. */
export const CHARACTER_WEIGHT_ORDER: CharacterWeight[] = [CharacterWeight.Main, CharacterWeight.Supporting, CharacterWeight.Minor];

export interface CharacterRelationship {
  target: string;
  type: string;
}

/** A character as one chapter shows them — one body and one outfit, being all a single chapter can say. */
export interface ChapterCharacter {
  name: string;
  alias: string[];
  weight: CharacterWeight;
  /** Body shape, face, features — the things that do not change between chapters. */
  body: string;
  /** Clothing, costume, styles — what this chapter has them wearing. */
  appearance: string;
  relationships: CharacterRelationship[];
}

/** One scene of a chapter: a continuous stretch of one place and time. */
export interface ChapterTimeline {
  /** `timelineYYYY`, numbered from 1 within the chapter. */
  idx: string;
  /** Where and when it happens. */
  context: string;
  summary: string;
  participants: string[];
}

export interface GlossaryTerm {
  term: string;
  category: string;
  definition: string;
}

/** One `chapter-XXXX.json` in full. */
export interface ChapterExtraction {
  /** `chapterXXXX`, the chapter's own number zero-padded. */
  chapterIdx: string;
  chapterTitle: string;
  characters: ChapterCharacter[];
  timelines: ChapterTimeline[];
  glossary: GlossaryTerm[];
}

/**
 * A character across the whole novel. What a chapter can only state once —
 * their outfit, who they are to whom — is keyed here by the
 * `chapterXXXX-timelineYYYY` it was true at, so the story's changes survive the
 * merge instead of the last chapter overwriting them.
 */
export interface WorldCharacter {
  name: string;
  alias: string[];
  weight: CharacterWeight;
  body: string;
  appearance: Record<string, string>;
  relationships: Record<string, CharacterRelationship[]>;
}

export interface WorldTimeline {
  /** `chapterXXXX-timelineYYYY` — unique across the novel. */
  idx: string;
  context: string;
  summary: string;
  participants: string[];
}

export interface WorldGlossaryTerm extends GlossaryTerm {
  /** How many chapters introduce or explain this term. */
  chapterCount: number;
}

/** `world.json` in full — every chapter extraction merged. */
export interface WorldBible {
  characters: WorldCharacter[];
  timelines: WorldTimeline[];
  glossary: WorldGlossaryTerm[];
}

/** One of the novel's chapters, and whether this workspace has extracted it. */
export interface WorkspaceExtractionChapter {
  idx: number;
  title: string;
  extracted: boolean;
}

/** The world bible as the step's screen reads it, with what it was merged from. */
export interface WorkspaceWorldState {
  /** Null until the step has extracted at least one chapter. */
  world: WorldBible | null;
  /** Every chapter of the novel, in order, saying which have been extracted. */
  chapters: WorkspaceExtractionChapter[];
  /** When `world.json` was last written, epoch ms, or null when there is none. */
  updatedAt: number | null;
  /** What the step will actually call, or null until the workspace's own engine and model are picked. */
  llm: LlmSettings | null;
  /** What the pickers may offer, from config.json. */
  llmOptions: LlmOptions;
}

export const APP_WORKSPACE_EXTRACTION_IPC_CHANNELS = {
  read: 'app-workspace-extraction:read',
  save: 'app-workspace-extraction:save',
  rebuild: 'app-workspace-extraction:rebuild',
  setLlm: 'app-workspace-extraction:set-llm',
} as const;

export interface AppWorkspaceExtractionApi {
  /** One workspace's `world.json`, as it stands on disk. */
  read(workspaceId: string): Promise<WorkspaceWorldState>;
  /** Overwrites `world.json` with the edited bible. Nothing is re-extracted. */
  save(workspaceId: string, world: WorldBible): Promise<WorkspaceWorldState>;
  /** Re-merges every chapter extraction, discarding hand edits to `world.json`. */
  rebuild(workspaceId: string): Promise<WorkspaceWorldState>;
  /** Points the workspace's LLM steps at an engine and model. Chapters already extracted are left as they are. */
  setLlm(workspaceId: string, llm: LlmSettings): Promise<WorkspaceWorldState>;
}
