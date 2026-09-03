import { describe, expect, it } from 'vitest';
import { CharacterWeight, type ChapterExtraction } from '@/shared/app-workspace-extraction';
import type { WorldTranslation } from '@/shared/app-workspace-translation';
import { chapterTranslationOf } from './distribute';

const extraction: ChapterExtraction = {
  chapterIdx: 'chapter0003',
  chapterTitle: 'The Ember Court',
  characters: [
    { name: 'Aria', alias: ['the Ashblade'], weight: CharacterWeight.Main, body: 'slight, amber eyes', appearance: 'a charcoal cloak', relationships: [{ target: 'Kel', type: 'rival' }] },
    { name: 'Kel', alias: [], weight: CharacterWeight.Minor, body: '', appearance: 'a red sash', relationships: [] },
  ],
  timelines: [
    { idx: 'timeline0001', context: 'the hall, at dawn', summary: 'Aria is sentenced.', participants: ['Aria', 'Kel'] },
    { idx: 'timeline0002', context: 'the lower city', summary: 'Aria hides.', participants: ['Aria'] },
  ],
  glossary: [
    { term: 'Ember Court', category: 'faction', definition: 'the tribunal' },
    { term: 'dye vats', category: 'place', definition: 'where cloth is coloured' },
  ],
};

const world: WorldTranslation = {
  characters: [
    {
      name: 'A-ri-a',
      nameOriginal: 'Aria',
      alias: [{ name: 'Kiếm Tro', nameOriginal: 'the Ashblade' }],
      weight: CharacterWeight.Main,
      body: 'mảnh khảnh, mắt hổ phách',
      appearance: { 'chapter0003-timeline0001': 'áo choàng than' },
      relationships: { 'chapter0003-timeline0001': [{ target: 'Ken', type: 'kình địch' }] },
    },
  ],
  timelines: [{ idx: 'chapter0003-timeline0001', context: 'đại sảnh, lúc bình minh', summary: 'A-ri-a bị kết án.', participants: ['A-ri-a', 'Kel'] }],
  glossary: [{ termOriginal: 'Ember Court', term: 'Triều Than', category: 'phe phái', definition: 'toà án', chapterCount: 2 }],
};

describe('chapterTranslationOf', () => {
  const translated = chapterTranslationOf(extraction, world, 'Triều Than');

  it('keeps the chapter ids and pairs the title with its original', () => {
    expect(translated.chapterIdx).toBe('chapter0003');
    expect(translated.chapterTitle).toBe('Triều Than');
    expect(translated.chapterTitleOriginal).toBe('The Ember Court');
  });

  it('applies a translated character at the scene the merge pinned them to', () => {
    const aria = translated.characters[0];
    expect(aria).toMatchObject({ name: 'A-ri-a', nameOriginal: 'Aria', body: 'mảnh khảnh, mắt hổ phách', appearance: 'áo choàng than' });
    expect(aria.alias).toEqual([{ name: 'Kiếm Tro', nameOriginal: 'the Ashblade' }]);
    expect(aria.relationships).toEqual([{ target: 'Ken', type: 'kình địch' }]);
  });

  it('leaves an untranslated character in the original language, with known names rendered', () => {
    expect(translated.characters[1]).toMatchObject({ name: 'Kel', nameOriginal: 'Kel', body: '', appearance: 'a red sash', relationships: [] });
    expect(translated.timelines[1].participants).toEqual(['A-ri-a']);
  });

  it('matches timelines by their world-wide id and keeps the chapter-local one', () => {
    expect(translated.timelines[0]).toEqual({ idx: 'timeline0001', context: 'đại sảnh, lúc bình minh', summary: 'A-ri-a bị kết án.', participants: ['A-ri-a', 'Kel'] });
    expect(translated.timelines[1]).toMatchObject({ idx: 'timeline0002', summary: 'Aria hides.' });
  });

  it('renders known terms and keeps unknown ones as they are', () => {
    expect(translated.glossary).toEqual([
      { termOriginal: 'Ember Court', term: 'Triều Than', category: 'phe phái', definition: 'toà án' },
      { termOriginal: 'dye vats', term: 'dye vats', category: 'place', definition: 'where cloth is coloured' },
    ]);
  });
});
