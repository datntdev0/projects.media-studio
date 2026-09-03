import { logger } from '@/main/helpers/logger';
import { runLlmJson } from '@/main/helpers/llm-cli';
import type { CharacterRelationship, WorldBible, WorldCharacter, WorldGlossaryTerm } from '@/shared/app-workspace-extraction';
import type { TranslatedName, WorldTranslation, WorldTranslationCharacter, WorldTranslationTimeline, WorldTranslatedGlossaryTerm } from '@/shared/app-workspace-translation';
import type { LlmSettings } from '@/shared/llm';
import { APPEARANCE_TRANSLATION_SCHEMA, buildAppearancePrompt, buildCharactersPrompt, buildGlossaryPrompt, buildRelationshipsPrompt, buildTimelinesPrompt, CHARACTERS_TRANSLATION_SCHEMA, GLOSSARY_TRANSLATION_SCHEMA, RELATIONSHIPS_TRANSLATION_SCHEMA, TIMELINES_TRANSLATION_SCHEMA, type AppearanceRow, type AppearanceRowsTranslated, type CharacterCoreSource, type CharacterCoreTranslated, type CharactersTranslated, type GlossaryTranslated, type RelationshipRow, type RelationshipRowsTranslated, type TimelinesTranslated } from './prompt';

/**
 * How much one call is asked to translate, as the JSON it is sent. The answer
 * runs about as long as the question, and a model asked for tens of thousands of
 * tokens in one go answers with a fraction of them — so batches are sized by
 * payload, never by count.
 */
const MAX_BATCH_CHARS = 6_000;

/** What one metadata call needs besides its entries. */
export interface MetadataTranslationContext {
  llm: LlmSettings;
  language: string;
  sourceLanguage: string;
}

/** Runs after every batch that lands, so a caller can persist it before the next call. */
type OnBatch = (world: WorldTranslation) => void;

/** One character's relationships in one scene — translated together so the scene is never half done. */
interface RelationshipGroup {
  character: string;
  idx: string;
  entries: CharacterRelationship[];
}

export function emptyWorldTranslation(): WorldTranslation {
  return { characters: [], timelines: [], glossary: [] };
}

/** Items in order, cut into batches that each fit the payload budget — an item too big for one batch gets a batch of its own. */
function batchesOf<T>(items: T[]): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [];
  let size = 0;
  for (const item of items) {
    const itemSize = JSON.stringify(item).length;
    if (batch.length > 0 && size + itemSize > MAX_BATCH_CHARS) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(item);
    size += itemSize;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/** Every name the translation has decided so far — characters and their aliases. */
export function decidedNamesOf(world: WorldTranslation): TranslatedName[] {
  return world.characters.flatMap((character) => [{ name: character.name, nameOriginal: character.nameOriginal }, ...character.alias]);
}

/** The translated entry for a source entry — matched by what it echoes back, falling back to its position in the batch. */
function pairUp<S, T>(sources: S[], translated: T[], keyOf: (source: S) => string, echoedOf: (entry: T) => string): [S, T][] {
  return sources.flatMap((source, at) => {
    const match = translated.find((entry) => echoedOf(entry) === keyOf(source)) ?? translated[at];
    return match ? [[source, match] as [S, T]] : [];
  });
}

/** What of a section is still to be translated — an entry already in the world translation is skipped, edits and all. */
function pendingOf<S>(section: string, entries: S[], isKnown: (entry: S) => boolean): S[] {
  const pending = entries.filter((entry) => !isKnown(entry));
  logger.info(`[translation] ${section}: ${entries.length - pending.length} already translated, ${pending.length} to translate`);
  return pending;
}

/** Sends the pending entries of one section in payload-sized batches, folding each answer in before the next call. */
async function translateSection<S, T>(world: WorldTranslation, pending: S[], ask: (batch: S[]) => Promise<T[]>, merge: (source: S, translated: T | undefined) => void, keyOf: (source: S) => string, echoedOf: (entry: T) => string, onBatch: OnBatch): Promise<void> {
  for (const batch of batchesOf(pending)) {
    const answered = await ask(batch);
    const paired = new Map(pairUp(batch, answered, keyOf, echoedOf));
    // An entry the model left out keeps its original wording, so no later pass asks for it again.
    for (const source of batch) merge(source, paired.get(source));
    onBatch(world);
  }
}

function characterOf(world: WorldTranslation, nameOriginal: string): WorldTranslationCharacter | undefined {
  return world.characters.find((candidate) => candidate.nameOriginal === nameOriginal);
}

/** Step one — every character's own facts; the names settled here are held to by everything after. */
async function translateCharacterCores(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext, onBatch: OnBatch): Promise<void> {
  const pending = pendingOf('characters', source.characters, (character) => characterOf(world, character.name) !== undefined);
  await translateSection<WorldCharacter, CharacterCoreTranslated>(
    world,
    pending,
    async (batch) => {
      const cores: CharacterCoreSource[] = batch.map((character) => ({ name: character.name, alias: character.alias, body: character.body }));
      const result = (await runLlmJson(buildCharactersPrompt(cores, decidedNamesOf(world), context.language, context.sourceLanguage), CHARACTERS_TRANSLATION_SCHEMA, context.llm)) as CharactersTranslated;
      return result.characters;
    },
    (character, translated) => {
      world.characters.push({
        name: translated?.name || character.name,
        nameOriginal: character.name,
        alias: character.alias.map((alias) => ({ name: translated?.alias.find((pair) => pair.nameOriginal === alias)?.name ?? alias, nameOriginal: alias })),
        weight: character.weight,
        body: translated?.body || character.body,
        appearance: {},
        relationships: {},
      });
    },
    (character) => character.name,
    (translated) => translated.nameOriginal,
    onBatch,
  );
}

/** Step two — what each character wears in each scene, one row per scene. */
async function translateAppearance(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext, onBatch: OnBatch): Promise<void> {
  const rows: AppearanceRow[] = source.characters.flatMap((character) => Object.entries(character.appearance).map(([idx, value]) => ({ character: character.name, idx, value })));
  const pending = pendingOf('appearance', rows, (row) => characterOf(world, row.character)?.appearance[row.idx] !== undefined);
  const rowKey = (row: AppearanceRow): string => `${row.character}|${row.idx}`;

  await translateSection<AppearanceRow, AppearanceRow>(
    world,
    pending,
    async (batch) => ((await runLlmJson(buildAppearancePrompt(batch, decidedNamesOf(world), context.language, context.sourceLanguage), APPEARANCE_TRANSLATION_SCHEMA, context.llm)) as AppearanceRowsTranslated).rows,
    (row, translated) => {
      const character = characterOf(world, row.character);
      if (character) character.appearance[row.idx] = translated?.value || row.value;
    },
    rowKey,
    rowKey,
    onBatch,
  );
}

/** Step three — who each character is to whom in each scene, one row per relationship, a scene's rows kept in one batch. */
async function translateRelationships(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext, onBatch: OnBatch): Promise<void> {
  const groups: RelationshipGroup[] = source.characters.flatMap((character) => Object.entries(character.relationships).map(([idx, entries]) => ({ character: character.name, idx, entries })));
  const pending = pendingOf('relationships', groups, (group) => characterOf(world, group.character)?.relationships[group.idx] !== undefined);
  const rowKey = (row: RelationshipRow): string => `${row.character}|${row.idx}|${row.targetOriginal}`;
  const rowOf = (group: RelationshipGroup, entry: CharacterRelationship): RelationshipRow => ({ character: group.character, idx: group.idx, targetOriginal: entry.target, target: entry.target, type: entry.type });

  for (const batch of batchesOf(pending)) {
    const rows = batch.flatMap((group) => group.entries.map((entry) => rowOf(group, entry)));
    const result = (await runLlmJson(buildRelationshipsPrompt(rows, decidedNamesOf(world), context.language, context.sourceLanguage), RELATIONSHIPS_TRANSLATION_SCHEMA, context.llm)) as RelationshipRowsTranslated;
    const translated = new Map(pairUp(rows, result.rows, rowKey, rowKey).map(([row, answer]) => [rowKey(row), answer]));

    for (const group of batch) {
      const character = characterOf(world, group.character);
      if (!character) continue;
      character.relationships[group.idx] = group.entries.map((entry) => {
        const row = translated.get(rowKey(rowOf(group, entry)));
        return { target: row?.target || entry.target, type: row?.type || entry.type };
      });
    }
    onBatch(world);
  }
}

async function translateTimelines(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext, onBatch: OnBatch): Promise<void> {
  const known = new Set(world.timelines.map((timeline) => timeline.idx));
  const pending = pendingOf('timelines', source.timelines, (timeline) => known.has(timeline.idx));

  await translateSection<WorldTranslationTimeline, WorldTranslationTimeline>(
    world,
    pending,
    async (batch) => ((await runLlmJson(buildTimelinesPrompt(batch, decidedNamesOf(world), context.language, context.sourceLanguage), TIMELINES_TRANSLATION_SCHEMA, context.llm)) as TimelinesTranslated).timelines,
    (timeline, translated) => {
      world.timelines.push({ ...(translated ?? timeline), idx: timeline.idx });
      world.timelines.sort((left, right) => left.idx.localeCompare(right.idx));
    },
    (timeline) => timeline.idx,
    (translated) => translated.idx,
    onBatch,
  );
}

async function translateGlossary(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext, onBatch: OnBatch): Promise<void> {
  const known = new Set(world.glossary.map((term) => term.termOriginal));
  const pending = pendingOf('glossary', source.glossary, (term) => known.has(term.term));

  await translateSection<WorldGlossaryTerm, WorldTranslatedGlossaryTerm>(
    world,
    pending,
    async (batch) => {
      const terms = batch.map((term) => ({ termOriginal: term.term, term: term.term, category: term.category, definition: term.definition }));
      return ((await runLlmJson(buildGlossaryPrompt(terms, decidedNamesOf(world), context.language, context.sourceLanguage), GLOSSARY_TRANSLATION_SCHEMA, context.llm)) as GlossaryTranslated).glossary.map((entry) => ({ ...entry, chapterCount: 0 }));
    },
    (term, translated) => {
      world.glossary.push({ termOriginal: term.term, term: translated?.term || term.term, category: translated?.category || term.category, definition: translated?.definition || term.definition, chapterCount: term.chapterCount });
    },
    (term) => term.term,
    (translated) => translated.termOriginal,
    onBatch,
  );
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
 * Brings a world translation up to date with the world bible: the characters
 * themselves first, so the names they settle can be held to in everything after;
 * then their per-scene outfits and relationships as rows, since a main character
 * carries hundreds of them and no single answer could hold them all; then the
 * scenes and the terms. Whatever the translation already has — a character by
 * its original name, a scene detail by its key, a timeline by its id, a term by
 * its original — is skipped, so a second pass costs only what is new and keeps
 * every edit. `onBatch` runs after every batch that lands, so a failure part-way
 * loses one call's worth at most.
 */
export async function translateMissingMetadata(world: WorldTranslation, source: WorldBible, context: MetadataTranslationContext, onBatch: OnBatch): Promise<void> {
  await translateCharacterCores(world, source, context, onBatch);
  await translateAppearance(world, source, context, onBatch);
  await translateRelationships(world, source, context, onBatch);
  await translateTimelines(world, source, context, onBatch);
  await translateGlossary(world, source, context, onBatch);

  syncCounts(world, source);
  onBatch(world);
  logger.info(`[translation] world translation covers ${world.characters.length} character(s), ${world.timelines.length} timeline(s), ${world.glossary.length} term(s)`);
}
