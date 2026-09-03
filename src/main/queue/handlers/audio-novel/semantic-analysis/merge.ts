import { CHARACTER_WEIGHT_ORDER, CharacterWeight, type ChapterCharacter, type ChapterExtraction, type ChapterTimeline, type GlossaryTerm, type WorldBible, type WorldCharacter, type WorldGlossaryTerm, type WorldTimeline } from '@/shared/app-workspace-extraction';
import { timelineIdxOf } from './store';

/** A glossary term being counted across chapters as the merge walks them. */
interface CountedTerm {
  entry: WorldGlossaryTerm;
  chapters: Set<string>;
}

/** The stronger of two readings of the same character's weight. */
function strongerWeight(left: CharacterWeight, right: CharacterWeight): CharacterWeight {
  return CHARACTER_WEIGHT_ORDER.indexOf(left) <= CHARACTER_WEIGHT_ORDER.indexOf(right) ? left : right;
}

/** The world-wide id of one of a chapter's timelines — `chapter0001-timeline0002`. */
export function worldTimelineIdx(chapterIdx: string, position: number): string {
  return `${chapterIdx}-${timelineIdxOf(position)}`;
}

/**
 * The timeline a character's chapter-wide details are pinned to: the first one
 * they take part in, falling back to the chapter's first. A chapter states an
 * outfit and a set of relationships once, but the world bible keys them by when
 * they were true, and this is the closest the chapter comes to saying when.
 */
export function timelineIdxFor(character: ChapterCharacter, chapterIdx: string, timelines: ChapterTimeline[]): string {
  const names = new Set([character.name, ...character.alias]);
  const position = timelines.findIndex((timeline) => timeline.participants.some((participant) => names.has(participant)));
  return worldTimelineIdx(chapterIdx, position === -1 ? 1 : position + 1);
}

/** Adds a character to the world, or folds them into the entry they already have. */
function mergeCharacter(characters: WorldCharacter[], byName: Map<string, WorldCharacter>, character: ChapterCharacter, timelineIdx: string): void {
  const names = [character.name, ...character.alias];
  const existing = names.map((name) => byName.get(name)).find((found) => found !== undefined);

  const merged: WorldCharacter = existing ?? { name: character.name, alias: [], weight: character.weight, body: '', appearance: {}, relationships: {} };
  if (!existing) characters.push(merged);

  merged.weight = strongerWeight(merged.weight, character.weight);
  merged.body = merged.body || character.body;
  if (character.appearance) merged.appearance[timelineIdx] = character.appearance;
  if (character.relationships.length > 0) merged.relationships[timelineIdx] = character.relationships;

  for (const alias of character.alias) {
    if (alias !== merged.name && !merged.alias.includes(alias)) merged.alias.push(alias);
  }
  for (const name of names) {
    if (!byName.has(name)) byName.set(name, merged);
  }
}

/** Counts a term's chapters, keeping the first chapter's wording of what it is. */
function mergeTerm(terms: Map<string, CountedTerm>, term: GlossaryTerm, chapterIdx: string): void {
  const key = term.term.trim().toLowerCase();
  if (!key) return;

  const counted = terms.get(key) ?? { entry: { term: term.term, category: term.category, definition: term.definition, chapterCount: 0 }, chapters: new Set<string>() };
  terms.set(key, counted);

  counted.entry.category = counted.entry.category || term.category;
  counted.entry.definition = counted.entry.definition || term.definition;
  counted.chapters.add(chapterIdx);
  counted.entry.chapterCount = counted.chapters.size;
}

/**
 * Merges every chapter extraction into one world bible. Pure code over what the
 * LLM already produced: characters are unified across their names and aliases,
 * a chapter's timelines are renumbered into ids unique across the novel, and a
 * glossary term keeps the first definition given for it plus a count of the
 * chapters that explain it. Chapters are expected in chapter order — earlier
 * chapters win wherever only one value fits.
 */
export function mergeWorldBible(chapters: ChapterExtraction[]): WorldBible {
  const characters: WorldCharacter[] = [];
  const byName = new Map<string, WorldCharacter>();
  const timelines: WorldTimeline[] = [];
  const terms = new Map<string, CountedTerm>();

  for (const chapter of chapters) {
    chapter.timelines.forEach((timeline, position) => {
      timelines.push({ idx: worldTimelineIdx(chapter.chapterIdx, position + 1), context: timeline.context, summary: timeline.summary, participants: timeline.participants });
    });

    for (const character of chapter.characters) {
      mergeCharacter(characters, byName, character, timelineIdxFor(character, chapter.chapterIdx, chapter.timelines));
    }

    for (const term of chapter.glossary) {
      mergeTerm(terms, term, chapter.chapterIdx);
    }
  }

  return { characters, timelines, glossary: [...terms.values()].map((counted) => counted.entry) };
}
