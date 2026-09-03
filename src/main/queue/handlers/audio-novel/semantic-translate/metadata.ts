import { logger } from '@/main/helpers/logger';
import { runLlmJson } from '@/main/helpers/llm-cli';
import type { CharacterRelationship, WorldBible, WorldCharacter } from '@/shared/app-workspace-extraction';
import type { TranslatedName, WorldTranslation, WorldTranslationCharacter, WorldTranslationTimeline, WorldTranslatedGlossaryTerm } from '@/shared/app-workspace-translation';
import type { LlmSettings } from '@/shared/llm';
import { buildCharactersPrompt, buildGlossaryPrompt, buildTimelinesPrompt, CHARACTERS_TRANSLATION_SCHEMA, GLOSSARY_TRANSLATION_SCHEMA, TIMELINES_TRANSLATION_SCHEMA, type CharacterSource, type CharacterTranslated, type CharactersTranslated, type GlossaryTranslated, type KeyedRelationship, type TimelinesTranslated } from './prompt';

/** How many entries one call translates — enough to keep names consistent within a call, few enough to keep it short. */
const BATCH_SIZE = 25;

/** What one metadata call needs besides its entries. */
export interface MetadataTranslationContext {
  llm: LlmSettings;
  language: string;
  sourceLanguage: string;
}

export function emptyWorldTranslation(): WorldTranslation {
  return { characters: [], timelines: [], glossary: [] };
}

function batchesOf<T>(items: T[]): T[][] {
  return Array.from({ length: Math.ceil(items.length / BATCH_SIZE) }, (_unused, at) => items.slice(at * BATCH_SIZE, (at + 1) * BATCH_SIZE));
}

/** Every name the translation has decided so far — characters and their aliases. */
export function decidedNamesOf(world: WorldTranslation): TranslatedName[] {
  return world.characters.flatMap((character) => [{ name: character.name, nameOriginal: character.nameOriginal }, ...character.alias]);
}

/**
 * What of a character is still to be translated: the whole of them when they are
 * new, otherwise only the keyed details later chapters have added. Undefined when
 * nothing is missing.
 */
function untranslatedPartOf(source: WorldCharacter, existing: WorldTranslationCharacter | undefined): CharacterSource | undefined {
  const appearance = Object.entries(source.appearance).filter(([idx]) => !existing || !(idx in existing.appearance)).map(([idx, value]) => ({ idx, value }));
  const relationships = Object.entries(source.relationships).filter(([idx]) => !existing || !(idx in existing.relationships)).flatMap(([idx, entries]) => entries.map((entry) => ({ idx, ...entry })));
  if (existing && appearance.length === 0 && relationships.length === 0) return undefined;
  return { name: source.name, alias: existing ? [] : source.alias, body: existing ? '' : source.body, appearance, relationships };
}

function groupRelationships(rows: KeyedRelationship[]): Record<string, CharacterRelationship[]> {
  const grouped: Record<string, CharacterRelationship[]> = {};
  for (const row of rows) {
    (grouped[row.idx] ??= []).push({ target: row.target, type: row.type });
  }
  return grouped;
}

/** Folds a translated character into the world translation — a new entry, or the missing details of the one already there. */
function mergeCharacter(world: WorldTranslation, source: WorldCharacter, translated: CharacterTranslated): void {
  const existing = world.characters.find((candidate) => candidate.nameOriginal === source.name);
  const merged: WorldTranslationCharacter = existing ?? {
    name: translated.name || source.name,
    nameOriginal: source.name,
    alias: source.alias.map((alias) => ({ name: translated.alias.find((pair) => pair.nameOriginal === alias)?.name ?? alias, nameOriginal: alias })),
    weight: source.weight,
    body: translated.body,
    appearance: {},
    relationships: {},
  };
  if (!existing) world.characters.push(merged);

  for (const row of translated.appearance) {
    if (!(row.idx in merged.appearance)) merged.appearance[row.idx] = row.value;
  }
  for (const [idx, entries] of Object.entries(groupRelationships(translated.relationships))) {
    if (!(idx in merged.relationships)) merged.relationships[idx] = entries;
  }
}

/** The translated entry for a source entry — matched by what it echoes back, falling back to its position in the batch. */
function pairUp<S, T>(sources: S[], translated: T[], originalOf: (source: S) => string, echoedOf: (entry: T) => string): [S, T][] {
  return sources.flatMap((source, at) => {
    const match = translated.find((entry) => echoedOf(entry) === originalOf(source)) ?? translated[at];
    return match ? [[source, match] as [S, T]] : [];
  });
}

async function translateCharacters(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext): Promise<void> {
  const pending = source.characters.flatMap((character) => {
    const part = untranslatedPartOf(character, world.characters.find((candidate) => candidate.nameOriginal === character.name));
    return part ? [{ character, part }] : [];
  });

  for (const batch of batchesOf(pending)) {
    const prompt = buildCharactersPrompt(batch.map((entry) => entry.part), decidedNamesOf(world), context.language, context.sourceLanguage);
    const result = (await runLlmJson(prompt, CHARACTERS_TRANSLATION_SCHEMA, context.llm)) as CharactersTranslated;
    for (const [entry, translated] of pairUp(batch, result.characters, (candidate) => candidate.character.name, (candidate) => candidate.nameOriginal)) {
      mergeCharacter(world, entry.character, translated);
    }
  }
}

async function translateTimelines(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext): Promise<void> {
  const known = new Set(world.timelines.map((timeline) => timeline.idx));
  const pending: WorldTranslationTimeline[] = source.timelines.filter((timeline) => !known.has(timeline.idx));

  for (const batch of batchesOf(pending)) {
    const prompt = buildTimelinesPrompt(batch, decidedNamesOf(world), context.language, context.sourceLanguage);
    const result = (await runLlmJson(prompt, TIMELINES_TRANSLATION_SCHEMA, context.llm)) as TimelinesTranslated;
    for (const [timeline, translated] of pairUp(batch, result.timelines, (candidate) => candidate.idx, (candidate) => candidate.idx)) {
      world.timelines.push({ ...translated, idx: timeline.idx });
    }
  }
  world.timelines.sort((left, right) => left.idx.localeCompare(right.idx));
}

async function translateGlossary(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext): Promise<void> {
  const known = new Set(world.glossary.map((term) => term.termOriginal));
  const pending = source.glossary.filter((term) => !known.has(term.term));

  for (const batch of batchesOf(pending)) {
    const prompt = buildGlossaryPrompt(batch.map((term) => ({ termOriginal: term.term, term: term.term, category: term.category, definition: term.definition })), decidedNamesOf(world), context.language, context.sourceLanguage);
    const result = (await runLlmJson(prompt, GLOSSARY_TRANSLATION_SCHEMA, context.llm)) as GlossaryTranslated;
    for (const [term, translated] of pairUp(batch, result.glossary, (candidate) => candidate.term, (candidate) => candidate.termOriginal)) {
      const entry: WorldTranslatedGlossaryTerm = { ...translated, termOriginal: term.term, chapterCount: term.chapterCount };
      world.glossary.push(entry);
    }
  }
}

/** The facts that are counted rather than translated follow the source on every pass. */
function syncCounts(world: WorldTranslation, source: WorldBible): void {
  for (const character of world.characters) {
    character.weight = source.characters.find((candidate) => candidate.name === character.nameOriginal)?.weight ?? character.weight;
  }
  for (const term of world.glossary) {
    term.chapterCount = source.glossary.find((candidate) => candidate.term === term.termOriginal)?.chapterCount ?? term.chapterCount;
  }
}

/**
 * Brings a world translation up to date with the world bible: characters first,
 * so the names they settle can be held to in the scenes and terms that follow,
 * each section in its own calls. Only what is not translated yet is sent, so a
 * second pass after more chapters are analysed costs only the new entries and
 * keeps every edit made to the first. `onSection` runs after each section so a
 * caller can persist what has landed before the next one starts.
 */
export async function translateMissingMetadata(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext, onSection: (world: WorldTranslation) => void): Promise<void> {
  const sections = [translateCharacters, translateTimelines, translateGlossary];
  for (const translate of sections) {
    await translate(world, source, context);
    syncCounts(world, source);
    onSection(world);
  }
  logger.info(`[translation] world translation covers ${world.characters.length} character(s), ${world.timelines.length} timeline(s), ${world.glossary.length} term(s)`);
}
