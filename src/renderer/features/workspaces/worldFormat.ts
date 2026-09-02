import { CHARACTER_WEIGHT_ORDER, CharacterWeight, type CharacterRelationship, type WorkspaceExtractionChapter, type WorldCharacter, type WorldGlossaryTerm, type WorldTimeline } from '@/shared/app-workspace-extraction';

/** Which part of the world bible the Semantic Analysis screen is showing. */
export enum WorldSection {
  Characters = 'characters',
  Timelines = 'timelines',
  Glossary = 'glossary',
}

export const WORLD_SECTION_LABEL: Record<WorldSection, string> = {
  [WorldSection.Characters]: 'Characters',
  [WorldSection.Timelines]: 'Timelines',
  [WorldSection.Glossary]: 'Glossary',
};

export const CHARACTER_WEIGHT_LABEL: Record<CharacterWeight, string> = {
  [CharacterWeight.Main]: 'Main',
  [CharacterWeight.Supporting]: 'Supporting',
  [CharacterWeight.Minor]: 'Minor',
};

export const WEIGHT_OPTIONS = CHARACTER_WEIGHT_ORDER;

/** A `chapter0001-timeline0002` key as the screen shows it. */
export function timelineKeyLabel(idx: string): string {
  const match = /^chapter(\d+)-timeline(\d+)$/.exec(idx);
  return match ? `Ch. ${Number(match[1])} · scene ${Number(match[2])}` : idx || 'Unplaced';
}

/** The chapter part of a scene key, so a character's chapters can be counted. */
function chapterOfKey(idx: string): string {
  return /^(chapter\d+)-/.exec(idx)?.[1] ?? idx;
}

/** A comma-separated list as typed, back to the array it stands for. */
export function parseList(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

export function formatList(values: string[]): string {
  return values.join(', ');
}

/** Relationships as one line — `mentor: Master Ilen · rival: Rhaim`. */
export function formatRelationships(entries: CharacterRelationship[]): string {
  return entries.map((entry) => `${entry.type}: ${entry.target}`).join(' · ');
}

/** Relationships as the edit dialog takes them: one `type: target` per line. */
export function formatRelationshipLines(entries: CharacterRelationship[]): string {
  return entries.map((entry) => `${entry.type}: ${entry.target}`).join('\n');
}

export function parseRelationshipLines(text: string): CharacterRelationship[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const at = line.indexOf(':');
      return at === -1 ? { target: line, type: '' } : { type: line.slice(0, at).trim(), target: line.slice(at + 1).trim() };
    });
}

/** One row of a character's per-scene block — its outfit and its relationships together. */
export interface CharacterSceneRow {
  idx: string;
  clothing: string;
  relationships: CharacterRelationship[];
}

/** Every scene a character has something recorded for, in story order. */
export function sceneRowsOf(character: WorldCharacter): CharacterSceneRow[] {
  const keys = [...new Set([...Object.keys(character.appearance), ...Object.keys(character.relationships)])].sort();
  return keys.map((idx) => ({ idx, clothing: character.appearance[idx] ?? '', relationships: character.relationships[idx] ?? [] }));
}

/** The line under a character's name — how much of the novel they are recorded across. */
export function characterChapterLabel(character: WorldCharacter): string {
  const scenes = sceneRowsOf(character);
  const chapters = new Set(scenes.map((scene) => chapterOfKey(scene.idx))).size;
  return `${CHARACTER_WEIGHT_LABEL[character.weight]} · ${chapters} chapter(s) · ${scenes.length} scene(s)`;
}

/** How far the step has got over the novel, for the chapters rail. */
export interface ExtractionProgress {
  done: number;
  total: number;
  pct: number;
  breakdown: string;
}

export function extractionProgressOf(chapters: WorkspaceExtractionChapter[]): ExtractionProgress {
  const done = chapters.filter((chapter) => chapter.extracted).length;
  const total = chapters.length;
  return {
    done,
    total,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
    breakdown: total === 0 ? 'This novel has no chapters stored yet' : `${done} extracted · ${total - done} not extracted yet`,
  };
}

export function emptyCharacter(): WorldCharacter {
  return { name: 'New character', alias: [], weight: CharacterWeight.Minor, body: '', appearance: {}, relationships: {} };
}

export function emptyTimeline(): WorldTimeline {
  return { idx: '', context: '', summary: '', participants: [] };
}

export function emptyTerm(): WorldGlossaryTerm {
  return { term: 'New term', category: '', definition: '', chapterCount: 0 };
}
