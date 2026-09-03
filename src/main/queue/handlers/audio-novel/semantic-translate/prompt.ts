import type { TranslatedGlossaryTerm, TranslatedName, WorldTranslationTimeline } from '@/shared/app-workspace-translation';

// The same strict-schema constraints as the extraction prompt apply (see
// semantic-analysis/prompt.ts): fixed keys only, everything required, no maps.
// A character's keyed details therefore travel as rows carrying their key, and
// are folded back into the world translation's maps in code.

/** One of a character's keyed details as a row — `idx` is the `chapterXXXX-timelineYYYY` it belongs to. */
export interface KeyedText {
  idx: string;
  value: string;
}

export interface KeyedRelationship {
  idx: string;
  target: string;
  type: string;
}

/** A character as it is sent for translation: the original strings, only the details not translated yet. */
export interface CharacterSource {
  name: string;
  alias: string[];
  body: string;
  appearance: KeyedText[];
  relationships: KeyedRelationship[];
}

/** A character as the translation comes back, every string paired with or keyed by what it translates. */
export interface CharacterTranslated extends TranslatedName {
  alias: TranslatedName[];
  body: string;
  appearance: KeyedText[];
  relationships: KeyedRelationship[];
}

export interface CharactersTranslated {
  characters: CharacterTranslated[];
}

export interface TimelinesTranslated {
  timelines: WorldTranslationTimeline[];
}

export interface GlossaryTranslated {
  glossary: TranslatedGlossaryTerm[];
}

const STRING_LIST = { type: 'array', items: { type: 'string' } };

const NAME_PAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'nameOriginal'],
  properties: { name: { type: 'string' }, nameOriginal: { type: 'string' } },
};

const KEYED_TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idx', 'value'],
  properties: { idx: { type: 'string' }, value: { type: 'string' } },
};

const KEYED_RELATIONSHIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idx', 'target', 'type'],
  properties: { idx: { type: 'string' }, target: { type: 'string' }, type: { type: 'string' } },
};

export const CHARACTERS_TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['characters'],
  properties: {
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'nameOriginal', 'alias', 'body', 'appearance', 'relationships'],
        properties: {
          name: { type: 'string' },
          nameOriginal: { type: 'string' },
          alias: { type: 'array', items: NAME_PAIR_SCHEMA },
          body: { type: 'string' },
          appearance: { type: 'array', items: KEYED_TEXT_SCHEMA },
          relationships: { type: 'array', items: KEYED_RELATIONSHIP_SCHEMA },
        },
      },
    },
  },
};

export const TIMELINES_TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['timelines'],
  properties: {
    timelines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['idx', 'context', 'summary', 'participants'],
        properties: { idx: { type: 'string' }, context: { type: 'string' }, summary: { type: 'string' }, participants: STRING_LIST },
      },
    },
  },
};

export const GLOSSARY_TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['glossary'],
  properties: {
    glossary: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['termOriginal', 'term', 'category', 'definition'],
        properties: { termOriginal: { type: 'string' }, term: { type: 'string' }, category: { type: 'string' }, definition: { type: 'string' } },
      },
    },
  },
};

/** How the metadata of a novel is to be translated — shared by the three section prompts. */
function metadataRules(language: string, sourceLanguage: string): string {
  return `You are translating the world-bible metadata of a novel from ${sourceLanguage} into ${language}, for translators of its chapters to look names and terms up in.

Rules:
- Render character names, aliases and proper nouns the way a published ${language} translation of this novel would — transliterate where that is the convention, keep a name unchanged where that is. Once a name is rendered one way, render it that way everywhere.
- Translate every other string naturally into ${language}. An empty string stays empty; a list with nothing in it stays [].
- Echo every "idx" and every "...Original" field back exactly as given — they are how the translation is matched to what it translates. Return exactly one entry per input entry, in the same order.
- Return only the JSON object.`;
}

/** The names already rendered, so a later call keeps to them. */
function decidedNames(names: TranslatedName[], language: string): string {
  if (names.length === 0) return '';
  const rows = names.map((pair) => `- ${pair.nameOriginal} → ${pair.name}`).join('\n');
  return `\nNames already rendered in ${language} — use these exactly wherever they appear, as a name, a participant or a relationship target:\n${rows}\n`;
}

export function buildCharactersPrompt(characters: CharacterSource[], names: TranslatedName[], language: string, sourceLanguage: string): string {
  return `${metadataRules(language, sourceLanguage)}
${decidedNames(names, language)}
Translate these characters. For each one return "nameOriginal" (the given "name"), "name" (rendered in ${language}), "alias" (one { name, nameOriginal } pair per given alias, same order), "body" translated, and every "appearance" and "relationships" row translated with its "idx" unchanged. A relationship "target" is a character name — render it as decided above, or consistently with the names you render here.

Characters:
${JSON.stringify(characters, null, 2)}`;
}

export function buildTimelinesPrompt(timelines: WorldTranslationTimeline[], names: TranslatedName[], language: string, sourceLanguage: string): string {
  return `${metadataRules(language, sourceLanguage)}
${decidedNames(names, language)}
Translate these scenes. For each one return "idx" unchanged, "context" and "summary" translated, and "participants" as the same characters rendered by their decided ${language} names.

Scenes:
${JSON.stringify(timelines, null, 2)}`;
}

export function buildGlossaryPrompt(glossary: TranslatedGlossaryTerm[], names: TranslatedName[], language: string, sourceLanguage: string): string {
  return `${metadataRules(language, sourceLanguage)}
${decidedNames(names, language)}
Translate these glossary terms. For each one return "termOriginal" (the given "term"), "term" rendered in ${language}, and "category" and "definition" translated.

Terms:
${JSON.stringify(glossary.map((term) => ({ term: term.term, category: term.category, definition: term.definition })), null, 2)}`;
}
