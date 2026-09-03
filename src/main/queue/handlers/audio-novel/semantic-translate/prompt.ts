import type { ChapterTranslation, TranslatedGlossaryTerm, TranslatedName, WorldTranslationTimeline } from '@/shared/app-workspace-translation';

// The same strict-schema constraints as the extraction prompt apply (see
// semantic-analysis/prompt.ts): fixed keys only, everything required, no maps.
// A character's keyed details therefore travel as rows carrying their key, and
// are folded back into the world translation's maps in code.

/** A character's own facts — what one call translates; their per-scene details travel as rows below. */
export interface CharacterCoreSource {
  name: string;
  alias: string[];
  body: string;
}

export interface CharacterCoreTranslated extends TranslatedName {
  alias: TranslatedName[];
  body: string;
}

export interface CharactersTranslated {
  characters: CharacterCoreTranslated[];
}

/** One character's outfit in one scene — `character` and `idx` are echoed keys, `value` is translated. */
export interface AppearanceRow {
  character: string;
  idx: string;
  value: string;
}

export interface AppearanceRowsTranslated {
  rows: AppearanceRow[];
}

/** One relationship of one character in one scene — `character`, `idx` and `targetOriginal` are echoed keys, `target` is rendered, `type` translated. */
export interface RelationshipRow {
  character: string;
  idx: string;
  targetOriginal: string;
  target: string;
  type: string;
}

export interface RelationshipRowsTranslated {
  rows: RelationshipRow[];
}

export interface TimelinesTranslated {
  timelines: WorldTranslationTimeline[];
}

export interface GlossaryTranslated {
  glossary: TranslatedGlossaryTerm[];
}

/** A chapter's title and text translated in one call. */
export interface ChapterTextTranslated {
  title: string;
  body: string;
}

const STRING_LIST = { type: 'array', items: { type: 'string' } };

const NAME_PAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'nameOriginal'],
  properties: { name: { type: 'string' }, nameOriginal: { type: 'string' } },
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
        required: ['name', 'nameOriginal', 'alias', 'body'],
        properties: { name: { type: 'string' }, nameOriginal: { type: 'string' }, alias: { type: 'array', items: NAME_PAIR_SCHEMA }, body: { type: 'string' } },
      },
    },
  },
};

export const APPEARANCE_TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['character', 'idx', 'value'],
        properties: { character: { type: 'string' }, idx: { type: 'string' }, value: { type: 'string' } },
      },
    },
  },
};

export const RELATIONSHIPS_TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['character', 'idx', 'targetOriginal', 'target', 'type'],
        properties: { character: { type: 'string' }, idx: { type: 'string' }, targetOriginal: { type: 'string' }, target: { type: 'string' }, type: { type: 'string' } },
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

export const CHAPTER_TEXT_TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: { title: { type: 'string' }, body: { type: 'string' } },
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

export function buildCharactersPrompt(characters: CharacterCoreSource[], names: TranslatedName[], language: string, sourceLanguage: string): string {
  return `${metadataRules(language, sourceLanguage)}
${decidedNames(names, language)}
Translate these characters. For each one return "nameOriginal" (the given "name"), "name" (rendered in ${language}), "alias" (one { name, nameOriginal } pair per given alias, same order) and "body" translated.

Characters:
${JSON.stringify(characters, null, 2)}`;
}

export function buildAppearancePrompt(rows: AppearanceRow[], names: TranslatedName[], language: string, sourceLanguage: string): string {
  return `${metadataRules(language, sourceLanguage)}
${decidedNames(names, language)}
Translate what these characters wear in these scenes. For each row return "character" and "idx" unchanged and "value" translated.

Rows:
${JSON.stringify(rows, null, 2)}`;
}

export function buildRelationshipsPrompt(rows: RelationshipRow[], names: TranslatedName[], language: string, sourceLanguage: string): string {
  return `${metadataRules(language, sourceLanguage)}
${decidedNames(names, language)}
Translate who these characters are to one another in these scenes. For each row return "character", "idx" and "targetOriginal" unchanged, "target" as that character's decided ${language} name, and "type" translated.

Rows:
${JSON.stringify(rows, null, 2)}`;
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

/**
 * Asks for one chapter's title and text translated against the chapter's own
 * translated metadata — the names and terms as the world translation renders
 * them, so a chapter never invents its own rendering of a name the rest of the
 * novel already has.
 */
export function buildChapterPrompt(metadata: ChapterTranslation, text: string, language: string, sourceLanguage: string): string {
  return `Translate one chapter of a novel from ${sourceLanguage} into ${language}.

Translation rules:
- Translate meaning and tone, not word for word; keep the register of a web novel — colloquial, punchy, fast to read.
- The metadata below is this chapter's characters, scenes and terms with their decided ${language} renderings. Wherever an original name or term appears in the text, render it exactly as the metadata does. A name the metadata still shows in ${sourceLanguage} has no decided rendering yet — render it the way a published ${language} translation would, and the same way every time. Leave no name or term in ${sourceLanguage}.
- Keep every line of dialogue, narration and interjection — do not summarise, merge or drop lines.
- Add nothing that is not in the source: no translator's notes, no explanations, no content warnings.
- Do not censor or soften anything the source says.
- Keep the source's paragraph and line structure exactly — one translated paragraph per source paragraph, in the same order.

Chapter metadata:
${JSON.stringify(metadata, null, 2)}

Chapter title (${sourceLanguage}): ${metadata.chapterTitleOriginal}

Chapter text:
---
${text}
---

Return a JSON object with "title" — the chapter title in ${language} — and "body" — the chapter text in ${language}. Return only the JSON object.`;
}
