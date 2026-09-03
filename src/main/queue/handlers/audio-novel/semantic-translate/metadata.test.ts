import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterWeight, type WorldBible } from '@/shared/app-workspace-extraction';
import { LlmEngine } from '@/shared/llm';
import { emptyWorldTranslation, translateMissingMetadata, type MetadataTranslationContext } from './metadata';
import { CHARACTERS_TRANSLATION_SCHEMA, GLOSSARY_TRANSLATION_SCHEMA, TIMELINES_TRANSLATION_SCHEMA, type CharacterSource } from './prompt';

const { runLlmJson } = vi.hoisted(() => ({ runLlmJson: vi.fn() }));
vi.mock('@/main/helpers/llm-cli', () => ({ runLlmJson }));

const context: MetadataTranslationContext = { llm: { engine: LlmEngine.Claude, model: 'test' }, language: 'Vietnamese', sourceLanguage: 'English' };

const source: WorldBible = {
  characters: [
    { name: 'Aria', alias: ['the Ashblade'], weight: CharacterWeight.Main, body: 'slight', appearance: { 'chapter0001-timeline0001': 'a cloak' }, relationships: { 'chapter0001-timeline0001': [{ target: 'Kel', type: 'rival' }] } },
  ],
  timelines: [{ idx: 'chapter0001-timeline0001', context: 'the hall', summary: 'Aria is sentenced.', participants: ['Aria'] }],
  glossary: [{ term: 'Ember Court', category: 'faction', definition: 'the tribunal', chapterCount: 1 }],
};

/** Answers each call with its input strings marked as translated, so the merge can be checked without a model. */
function fakeTranslation(prompt: string, schema: object): unknown {
  const input = JSON.parse(prompt.slice(prompt.indexOf('\n[')).trim()) as unknown[];
  if (schema === CHARACTERS_TRANSLATION_SCHEMA) {
    return {
      characters: (input as CharacterSource[]).map((character) => ({
        nameOriginal: character.name,
        name: `${character.name}-vi`,
        alias: character.alias.map((alias) => ({ nameOriginal: alias, name: `${alias}-vi` })),
        body: character.body && `${character.body}-vi`,
        appearance: character.appearance.map((row) => ({ idx: row.idx, value: `${row.value}-vi` })),
        relationships: character.relationships.map((row) => ({ ...row, type: `${row.type}-vi` })),
      })),
    };
  }
  if (schema === TIMELINES_TRANSLATION_SCHEMA) {
    return { timelines: (input as { idx: string; summary: string }[]).map((timeline) => ({ idx: timeline.idx, context: 'ctx-vi', summary: `${timeline.summary}-vi`, participants: ['Aria-vi'] })) };
  }
  if (schema === GLOSSARY_TRANSLATION_SCHEMA) {
    return { glossary: (input as { term: string }[]).map((term) => ({ termOriginal: term.term, term: `${term.term}-vi`, category: 'cat-vi', definition: 'def-vi' })) };
  }
  throw new Error('unexpected schema');
}

describe('translateMissingMetadata', () => {
  beforeEach(() => {
    runLlmJson.mockReset();
    runLlmJson.mockImplementation(async (prompt: string, schema: object) => fakeTranslation(prompt, schema));
  });

  it('translates every section from nothing, one call each, and reports after each section', async () => {
    const world = emptyWorldTranslation();
    const sections: number[] = [];
    await translateMissingMetadata(world, source, context, (current) => sections.push(current.characters.length + current.timelines.length + current.glossary.length));

    expect(runLlmJson).toHaveBeenCalledTimes(3);
    expect(sections).toEqual([1, 2, 3]);
    expect(world.characters[0]).toEqual({
      name: 'Aria-vi',
      nameOriginal: 'Aria',
      alias: [{ name: 'the Ashblade-vi', nameOriginal: 'the Ashblade' }],
      weight: CharacterWeight.Main,
      body: 'slight-vi',
      appearance: { 'chapter0001-timeline0001': 'a cloak-vi' },
      relationships: { 'chapter0001-timeline0001': [{ target: 'Kel', type: 'rival-vi' }] },
    });
    expect(world.timelines[0]).toMatchObject({ idx: 'chapter0001-timeline0001', summary: 'Aria is sentenced.-vi' });
    expect(world.glossary[0]).toEqual({ termOriginal: 'Ember Court', term: 'Ember Court-vi', category: 'cat-vi', definition: 'def-vi', chapterCount: 1 });
  });

  it('makes no call when everything is already translated, and keeps edits', async () => {
    const world = emptyWorldTranslation();
    await translateMissingMetadata(world, source, context, () => {});
    runLlmJson.mockClear();
    world.characters[0].name = 'Edited';

    await translateMissingMetadata(world, source, context, () => {});

    expect(runLlmJson).not.toHaveBeenCalled();
    expect(world.characters[0].name).toBe('Edited');
  });

  it('sends only what a later chapter added to a known character, and folds it in', async () => {
    const world = emptyWorldTranslation();
    await translateMissingMetadata(world, source, context, () => {});
    runLlmJson.mockClear();

    const grown: WorldBible = {
      ...source,
      characters: [{ ...source.characters[0], appearance: { ...source.characters[0].appearance, 'chapter0002-timeline0001': 'court whites' } }],
      glossary: [{ ...source.glossary[0], chapterCount: 2 }],
    };
    await translateMissingMetadata(world, grown, context, () => {});

    const sent = JSON.parse((runLlmJson.mock.calls[0][0] as string).slice((runLlmJson.mock.calls[0][0] as string).indexOf('\n[')).trim()) as CharacterSource[];
    expect(sent).toEqual([{ name: 'Aria', alias: [], body: '', appearance: [{ idx: 'chapter0002-timeline0001', value: 'court whites' }], relationships: [] }]);
    expect(runLlmJson).toHaveBeenCalledTimes(1);
    expect(world.characters[0].appearance).toEqual({ 'chapter0001-timeline0001': 'a cloak-vi', 'chapter0002-timeline0001': 'court whites-vi' });
    expect(world.characters[0].body).toBe('slight-vi');
    expect(world.glossary[0].chapterCount).toBe(2);
  });
});
