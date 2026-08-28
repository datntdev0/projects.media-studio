// codex's `--output-schema` runs through OpenAI's strict Structured Outputs mode: every object
// must set `additionalProperties: false` and list every key as `required` — see the same note in
// workflow-analyze/schemas.ts.

/** Forces the whole-book glossary translation call to echo back each original term/name alongside its translation, so the two stay reliably paired rather than parsed back out of prose. */
export const GLOSSARY_TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['glossary', 'characters'],
  properties: {
    glossary: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'translatedTerm', 'category', 'definition'],
        properties: {
          term: { type: 'string' },
          translatedTerm: { type: 'string' },
          category: { type: 'string' },
          definition: { type: 'string' },
        },
      },
    },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'translatedName', 'aliases', 'translatedAliases'],
        properties: {
          name: { type: 'string' },
          translatedName: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          translatedAliases: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

/** Forces a chapter-translation call to return both the translated title and the translated body in one response — see llm-cli's `runLlmPrint` schema contract (strict Structured Outputs for codex, an embedded instruction for claude). */
export const CHAPTER_TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
  },
};
