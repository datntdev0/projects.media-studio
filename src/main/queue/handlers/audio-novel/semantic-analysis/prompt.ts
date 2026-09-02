import { CHARACTER_WEIGHT_ORDER, type ChapterExtraction } from '@/shared/app-workspace-extraction';

// codex's `--output-schema` runs through OpenAI's strict Structured Outputs mode:
// every object must set `additionalProperties: false` and list every key as
// required — no optional fields and no dynamic-keyed maps. That is why a chapter
// extraction is all fixed keys and arrays, and why "not mentioned" has to be an
// empty string rather than a missing property.

const RELATIONSHIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['target', 'type'],
  properties: { target: { type: 'string' }, type: { type: 'string' } },
};

const CHARACTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'alias', 'weight', 'body', 'appearance', 'relationships'],
  properties: {
    name: { type: 'string' },
    alias: { type: 'array', items: { type: 'string' } },
    weight: { type: 'string', enum: CHARACTER_WEIGHT_ORDER },
    body: { type: 'string' },
    appearance: { type: 'string' },
    relationships: { type: 'array', items: RELATIONSHIP_SCHEMA },
  },
};

const TIMELINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idx', 'context', 'summary', 'participants'],
  properties: {
    idx: { type: 'string' },
    context: { type: 'string' },
    summary: { type: 'string' },
    participants: { type: 'array', items: { type: 'string' } },
  },
};

const GLOSSARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['term', 'category', 'definition'],
  properties: { term: { type: 'string' }, category: { type: 'string' }, definition: { type: 'string' } },
};

/** The shape one chapter's extraction must come back in. */
export const CHAPTER_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chapterIdx', 'chapterTitle', 'characters', 'timelines', 'glossary'],
  properties: {
    chapterIdx: { type: 'string' },
    chapterTitle: { type: 'string' },
    characters: { type: 'array', items: CHARACTER_SCHEMA },
    timelines: { type: 'array', items: TIMELINE_SCHEMA },
    glossary: { type: 'array', items: GLOSSARY_SCHEMA },
  },
};

/** Shown to the model as the shape to follow — in a different language, so it copies the structure and not the content. */
const CHAPTER_EXAMPLE: ChapterExtraction = {
  chapterIdx: 'chapter0001',
  chapterTitle: 'Sentencing at the Ember Court',
  characters: [
    {
      name: 'Aria',
      alias: ['the Ashblade'],
      weight: CHARACTER_WEIGHT_ORDER[0],
      body: 'slight, amber eyes, a burn scar across the left cheek',
      appearance: 'a charcoal travelling cloak over court whites',
      relationships: [{ target: 'Kel Varro', type: 'rival' }],
    },
    { name: 'Kel Varro', alias: [], weight: CHARACTER_WEIGHT_ORDER[1], body: '', appearance: 'the tribunal’s red sash', relationships: [{ target: 'Aria', type: 'rival' }] },
  ],
  timelines: [
    { idx: 'timeline0001', context: 'the Ember Court hall, at dawn', summary: 'Aria is sentenced and flees before the verdict is read out.', participants: ['Aria', 'Kel Varro'] },
    { idx: 'timeline0002', context: 'the lower city, the same morning', summary: 'Aria hides among the dye vats and hears she is being hunted.', participants: ['Aria'] },
  ],
  glossary: [{ term: 'Ember Court', category: 'faction', definition: 'the tribunal that rules the upper city' }],
};

/**
 * Asks for one chapter's characters, scenes and glossary. Everything the model
 * needs is in the prompt — it has no filesystem access — and anything the chapter
 * does not actually say is to come back empty rather than be filled in from
 * elsewhere, since a later chapter's own extraction is where that belongs.
 */
export function buildChapterExtractionPrompt(chapterIdx: string, title: string, language: string, text: string): string {
  return `You are extracting world-bible data from one chapter of a novel, to be merged with every other chapter later.

Chapter id: ${chapterIdx}
Chapter title: ${title}
Language: ${language} — keep every string you write in this language, do not translate anything.

Chapter text:
---
${text}
---

Split the chapter into timelines. A timeline is one continuous stretch of a single place and time; most chapters are one or two, so only split on a clear jump in place, time or point of view. Number them "timeline0001", "timeline0002", ... in the order they happen.

Fill in:
- characters: every named character who appears or is referred to. "weight" is how much of the story they carry — "${CHARACTER_WEIGHT_ORDER[0]}", "${CHARACTER_WEIGHT_ORDER[1]}" or "${CHARACTER_WEIGHT_ORDER[2]}". "body" is body shape, face and features; "appearance" is clothing, costume and style. "relationships" is who they are to other named characters as of this chapter.
- timelines: one entry per timeline, with where and when it happens, what happens, and who is in it.
- glossary: every proper noun this chapter introduces or explains — a place, item, technique, faction, rank or title — with what the chapter says it is.

Rules:
- Only what this chapter states. If it does not describe a character's body, leave "body" as "". Same for every other string, and use [] for a list with nothing in it. Never guess and never carry anything over from what you know of the wider story.
- Use each character's most common name for "name" and put every other name the chapter calls them in "alias".
- Refer to characters by their "name" in participants and relationships, not by an alias.

The example below shows the exact shape to follow — copy its structure, not its content:
${JSON.stringify(CHAPTER_EXAMPLE, null, 2)}

Return only the JSON object.`;
}
