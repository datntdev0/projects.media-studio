import { timelineIdxFor, worldTimelineIdx } from '@/main/queue/handlers/audio-novel/semantic-analysis';
import type { ChapterCharacter, ChapterExtraction } from '@/shared/app-workspace-extraction';
import type { ChapterTranslation, ChapterTranslationCharacter, WorldTranslation, WorldTranslationCharacter } from '@/shared/app-workspace-translation';

/** Every original name the world translation knows — a character's own or one of their aliases — to the character it belongs to. */
function charactersByOriginalName(world: WorldTranslation): Map<string, WorldTranslationCharacter> {
  const byName = new Map<string, WorldTranslationCharacter>();
  for (const character of world.characters) {
    for (const name of [character.nameOriginal, ...character.alias.map((alias) => alias.nameOriginal)]) {
      if (!byName.has(name)) byName.set(name, character);
    }
  }
  return byName;
}

/**
 * A chapter's extraction with the world translation's renderings applied. Pure
 * code: every string is looked up by the original it translates, and one the
 * world translation has no rendering for yet stays in the original language, so a
 * chapter analysed after the last metadata translation still distributes — the
 * chapter's own translation prompt is told to render such a name consistently.
 */
export function chapterTranslationOf(extraction: ChapterExtraction, world: WorldTranslation, chapterTitle: string): ChapterTranslation {
  const byName = charactersByOriginalName(world);
  const nameOf = (original: string): string => byName.get(original)?.name ?? original;

  const characterOf = (character: ChapterCharacter): ChapterTranslationCharacter => {
    const found = byName.get(character.name);
    const key = timelineIdxFor(character, extraction.chapterIdx, extraction.timelines);
    return {
      name: nameOf(character.name),
      nameOriginal: character.name,
      alias: character.alias.map((alias) => ({ name: found?.alias.find((pair) => pair.nameOriginal === alias)?.name ?? nameOf(alias), nameOriginal: alias })),
      weight: character.weight,
      body: found?.body || character.body,
      appearance: found?.appearance[key] ?? character.appearance,
      relationships: found?.relationships[key] ?? character.relationships.map((entry) => ({ target: nameOf(entry.target), type: entry.type })),
    };
  };

  return {
    chapterIdx: extraction.chapterIdx,
    chapterTitle,
    chapterTitleOriginal: extraction.chapterTitle,
    characters: extraction.characters.map(characterOf),
    timelines: extraction.timelines.map((timeline, position) => {
      const found = world.timelines.find((candidate) => candidate.idx === worldTimelineIdx(extraction.chapterIdx, position + 1));
      return { idx: timeline.idx, context: found?.context ?? timeline.context, summary: found?.summary ?? timeline.summary, participants: found?.participants ?? timeline.participants.map(nameOf) };
    }),
    glossary: extraction.glossary.map((term) => {
      const found = world.glossary.find((candidate) => candidate.termOriginal === term.term);
      return { termOriginal: term.term, term: found?.term ?? term.term, category: found?.category ?? term.category, definition: found?.definition ?? term.definition };
    }),
  };
}
