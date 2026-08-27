export interface GlossaryEntry {
  term: string;
  category: string;
  definition: string;
}

export interface RelationshipEntry {
  target: string;
  type: string;
}

export interface AppearanceDetail {
  key: string;
  value: string;
}

/** A character's physical description as of one scene — codex's structured output must be strict-schema compliant, which rules out a dynamic-keyed `{ [sceneId]: {...} }` map, hence the array-of-entries shape. */
export interface AppearanceEntry {
  idx: string;
  details: AppearanceDetail[];
}

export interface CharacterEntry {
  name: string;
  aliases: string[];
  appearance: AppearanceEntry[];
  relationships: RelationshipEntry[];
}

/** A character as merged into the world bible — relationships are dropped here since they change over the story and a single flat list per character would go stale; per-chapter relationships (as of that point in the story) live on `ChapterExtraction.characters[].relationships` instead. */
export interface WorldCharacterEntry {
  name: string;
  aliases: string[];
  appearance: AppearanceEntry[];
}

export interface ChapterTimelineEntry {
  idx: string;
  summary: string;
  participants: string[];
  location: string;
}

/** One chapter's extraction — `chapter-NNNN.json` under a workflow's `extraction/` directory. */
export interface ChapterExtraction {
  overview: { summary: string; glossary: GlossaryEntry[] };
  characters: CharacterEntry[];
  timeline: ChapterTimelineEntry[];
}

/** The merged world bible — `world.json` under a workflow's `extraction/` directory. Same shape as a chapter extraction; `timeline` stays a flat array (scene ids are already unique across the book, so nothing needs grouping). */
export interface WorldBible {
  overview: { summary: string; glossary: GlossaryEntry[] };
  characters: WorldCharacterEntry[];
  timeline: ChapterTimelineEntry[];
}

export interface ConflictResolution {
  issue: string;
  resolution: string;
}
