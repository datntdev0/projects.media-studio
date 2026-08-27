// codex's `--output-schema` runs through OpenAI's strict Structured Outputs mode: every object
// must set `additionalProperties: false` and list every key as `required` — no optional fields,
// no dynamic-keyed maps. That's why `appearance` and `timeline` are arrays of entries here rather
// than objects keyed by scene id.

const GLOSSARY_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['term', 'category', 'definition'],
  properties: { term: { type: 'string' }, category: { type: 'string' }, definition: { type: 'string' } },
};

const TIMELINE_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idx', 'summary', 'participants', 'location'],
  properties: { idx: { type: 'string' }, summary: { type: 'string' }, participants: { type: 'array', items: { type: 'string' } }, location: { type: 'string' } },
};

const APPEARANCE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['idx', 'details'],
    properties: {
      idx: { type: 'string' },
      details: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['key', 'value'], properties: { key: { type: 'string' }, value: { type: 'string' } } },
      },
    },
  },
};

/** A single chapter's per-character extraction — includes `relationships` as of that point in the story. */
const CHARACTER_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'aliases', 'appearance', 'relationships'],
  properties: {
    name: { type: 'string' },
    aliases: { type: 'array', items: { type: 'string' } },
    appearance: APPEARANCE_SCHEMA,
    relationships: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['target', 'type'], properties: { target: { type: 'string' }, type: { type: 'string' } } },
    },
  },
};

/** A character as merged into the world bible — no `relationships`, which change over the story and would go stale as a single flat list. */
const WORLD_CHARACTER_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'aliases', 'appearance'],
  properties: {
    name: { type: 'string' },
    aliases: { type: 'array', items: { type: 'string' } },
    appearance: APPEARANCE_SCHEMA,
  },
};

const OVERVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'glossary'],
  properties: { summary: { type: 'string' }, glossary: { type: 'array', items: GLOSSARY_ENTRY_SCHEMA } },
};

/** Forces `codex exec --output-schema` to shape one chapter's extraction. */
export const CHAPTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'characters', 'timeline'],
  properties: {
    overview: OVERVIEW_SCHEMA,
    characters: { type: 'array', items: CHARACTER_ENTRY_SCHEMA },
    timeline: { type: 'array', items: TIMELINE_ENTRY_SCHEMA },
  },
};

/** Forces `codex exec --output-schema` to shape the conflict-resolution response. */
export const RESOLVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['world', 'resolutions'],
  properties: {
    world: {
      type: 'object',
      additionalProperties: false,
      required: ['overview', 'characters', 'timeline'],
      properties: {
        overview: OVERVIEW_SCHEMA,
        characters: { type: 'array', items: WORLD_CHARACTER_ENTRY_SCHEMA },
        timeline: { type: 'array', items: TIMELINE_ENTRY_SCHEMA },
      },
    },
    resolutions: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['issue', 'resolution'], properties: { issue: { type: 'string' }, resolution: { type: 'string' } } },
    },
  },
};

/** Example shape shown to the model in the extraction prompt — mirrors `template.chapter-NNNN.json`. */
export const CHAPTER_TEMPLATE = {
  overview: {
    summary: 'Aria flees sentencing before the Ember Court.',
    glossary: [{ term: 'Ember Court', category: 'Faction', definition: 'the ruling tribunal' }],
  },
  characters: [
    {
      name: 'Aria',
      aliases: ['the Ashblade'],
      appearance: [
        { idx: 'chapter-0001-scene-0001', details: [{ key: 'eyes', value: 'amber' }, { key: 'attire', value: 'charcoal cloak' }] },
        { idx: 'chapter-0002-scene-0001', details: [{ key: 'eyes', value: 'amber' }, { key: 'attire', value: 'charcoal cloak' }] },
      ],
      relationships: [{ target: 'Kel Varro', type: 'rival-turned-ally' }],
    },
  ],
  timeline: [
    { idx: 'chapter-0001-scene-0001', summary: 'Aria flees sentencing before the Ember Court.', participants: ['Aria'], location: 'the Ember Court hall' },
  ],
};
