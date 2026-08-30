import type { AppearanceEntry, ChapterExtraction, CharacterEntry, GlossaryEntry, WorldBible, WorldCharacterEntry } from './types';

function mergeGlossary(glossary: GlossaryEntry[], seen: Set<string>, entries: GlossaryEntry[]): void {
  for (const entry of entries) {
    if (seen.has(entry.term)) {
      continue;
    }
    seen.add(entry.term);
    glossary.push(entry);
  }
}

/** Unions two characters' appearance lists, keeping one entry per scene id — a later chapter's entry for the same scene id wins, mirroring the original `dict.update` semantics. */
function mergeAppearance(appearance: AppearanceEntry[], additions: AppearanceEntry[]): void {
  for (const addition of additions) {
    const existing = appearance.findIndex((entry) => entry.idx === addition.idx);
    if (existing === -1) {
      appearance.push(addition);
    } else {
      appearance[existing] = addition;
    }
  }
}

function mergeCharacters(characters: WorldCharacterEntry[], nameIndex: Map<string, number>, entries: CharacterEntry[]): void {
  for (const entry of entries) {
    const keys = [entry.name, ...entry.aliases];
    const existingIdx = keys.map((key) => nameIndex.get(key)).find((idx) => idx !== undefined);
    if (existingIdx === undefined) {
      const merged: WorldCharacterEntry = { name: entry.name, aliases: [...new Set(entry.aliases)], appearance: [...entry.appearance] };
      characters.push(merged);
      const idx = characters.length - 1;
      for (const key of keys) {
        if (!nameIndex.has(key)) {
          nameIndex.set(key, idx);
        }
      }
      continue;
    }
    const merged = characters[existingIdx];
    for (const alias of entry.aliases) {
      if (!merged.aliases.includes(alias)) {
        merged.aliases.push(alias);
      }
      if (!nameIndex.has(alias)) {
        nameIndex.set(alias, existingIdx);
      }
    }
    mergeAppearance(merged.appearance, entry.appearance);
  }
}

function mergeTimeline(timeline: WorldBible['timeline'], scenes: ChapterExtraction['timeline']): void {
  timeline.push(...scenes);
}

/** Merges a set of chapter extractions into one world bible — glossary/characters/timeline unioned across chapters. Pure and cheap, so callers compute it on demand from whichever chapters they care about rather than persisting a combined file. */
export function mergeWorld(chapters: ChapterExtraction[]): WorldBible {
  const world: WorldBible = { glossary: [], characters: [], timeline: [] };
  const termSeen = new Set<string>();
  const nameIndex = new Map<string, number>();

  for (const chapter of chapters) {
    mergeGlossary(world.glossary, termSeen, chapter.glossary);
    mergeCharacters(world.characters, nameIndex, chapter.characters);
    mergeTimeline(world.timeline, chapter.timeline);
  }

  return world;
}
