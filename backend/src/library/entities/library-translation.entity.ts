import { LibraryContent } from './library-content.entity';

/**
 * The languages a novel can be read in besides its own.
 *
 * A closed set rather than a registry: each one is a subcollection that has to
 * exist in the map below and in the index overrides, so a fourth is a deliberate
 * act rather than a string a request can invent.
 */
export enum TranslationLanguage {
  Vietnamese = 'vi',
  English = 'en',
  Chinese = 'zh',
}

/**
 * Where each language's documents live, under the item they translate. A lookup
 * rather than a template, so the collection a request reaches is one of three
 * names this file wrote — never a string it supplied.
 */
export const TRANSLATION_SUBCOLLECTIONS: Record<TranslationLanguage, string> = {
  [TranslationLanguage.Vietnamese]: 'translation_vi',
  [TranslationLanguage.English]: 'translation_en',
  [TranslationLanguage.Chinese]: 'translation_zh',
};

/** Every language: what the coverage answer lists, and what a cascade clears. */
export const TRANSLATION_LANGUAGES = Object.values(TranslationLanguage);

/**
 * A row as a language-aware route answers with — the content, and the two things
 * a client cannot work out for itself.
 *
 * `translated` is false when the row is the source, either because no language was
 * asked for or because none is stored; a client has to tell that apart from a
 * translation that happens to read like the original. `sourceTitle` is derived on
 * every read rather than stored, so renaming a chapter renames the subtitle under
 * every translation of it.
 */
export type TranslatedContent = LibraryContent & { translated: boolean; sourceTitle: string | null };

/** How much of a novel one language covers. Computed per read; nothing stores it. */
export interface TranslationCoverage {
  language: TranslationLanguage;
  translated: number;
}
