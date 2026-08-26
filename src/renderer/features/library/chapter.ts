// Session-view helpers for the novel detail page's chapter list/reader. A
// chapter is really two persisted rows (see shared/app-library-content.ts):
// an Original `AppLibraryContent` row plus, per translated language, a
// sibling Translation row sharing the same `idx`. This module merges them
// into one `ChapterRow` per `idx`, the shape the UI has always shown — one
// row with a language switcher — regardless of how many rows actually back it.

import { ContentLanguage, AppLibraryContentStatus, AppLibraryContentType, type AppLibraryContent } from '../../../shared/app-library-content';

export type ChapterLang = ContentLanguage;

export const CHAPTER_LANGS: ChapterLang[] = [ContentLanguage.Chinese, ContentLanguage.Vietnamese, ContentLanguage.English];

export const CHAPTER_LANG_NAME: Record<ChapterLang, string> = {
  [ContentLanguage.Chinese]: 'Chinese',
  [ContentLanguage.Vietnamese]: 'Vietnamese',
  [ContentLanguage.English]: 'English',
};

/** Matches a novel's stored language (a code or free text like "Chinese") to one of the three supported languages. */
export function resolveSourceLang(language: string): ChapterLang | undefined {
  const key = language.trim().toLowerCase();
  return CHAPTER_LANGS.find((code) => code === key || CHAPTER_LANG_NAME[code].toLowerCase() === key);
}

export const CHAPTER_STATUS_LABEL: Record<AppLibraryContentStatus, string> = {
  [AppLibraryContentStatus.Discovered]: 'Discovered',
  [AppLibraryContentStatus.Pending]: 'Pending',
  [AppLibraryContentStatus.InProgress]: 'Scraping',
  [AppLibraryContentStatus.Completed]: 'Completed',
  [AppLibraryContentStatus.Failed]: 'Failed',
};

export const CHAPTER_STATUS_TAG_CLASS: Record<AppLibraryContentStatus, string> = {
  [AppLibraryContentStatus.Discovered]: 'tag-outline',
  [AppLibraryContentStatus.Pending]: 'tag-neutral',
  [AppLibraryContentStatus.InProgress]: 'tag-accent',
  [AppLibraryContentStatus.Completed]: 'tag-primary',
  [AppLibraryContentStatus.Failed]: 'tag-outline',
};

export interface ChapterRow {
  /** The Original content row's id — the chapter's identity regardless of which language is being viewed. */
  id: string;
  no: number;
  title: string;
  status: AppLibraryContentStatus;
  updatedAt: number;
  sourceLanguage: ChapterLang | undefined;
  sourceBody: string;
  translationId: string | undefined;
  translationBody: string | undefined;
}

/** Merges a library item's content rows into one row per chapter, carrying whichever translation matches `lang`. */
export function buildChapterRows(contents: AppLibraryContent[], lang: ChapterLang): ChapterRow[] {
  const translationByIdx = new Map<number, AppLibraryContent>();
  for (const content of contents) {
    if (content.type === AppLibraryContentType.Translation && content.textContent?.language === lang) {
      translationByIdx.set(content.idx, content);
    }
  }

  return contents
    .filter((content) => content.type === AppLibraryContentType.Original)
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((original) => {
      const translation = translationByIdx.get(original.idx);
      return {
        id: original.id,
        no: original.idx,
        title: original.textContent?.title ?? '',
        status: original.status,
        updatedAt: original.updatedAt,
        sourceLanguage: original.textContent?.language,
        sourceBody: original.textContent?.body ?? '',
        translationId: translation?.id,
        translationBody: translation?.textContent?.body,
      };
    });
}

export { countWords } from '../../../shared/text';

export function bodyFor(chapter: ChapterRow, lang: ChapterLang): string {
  if (lang === chapter.sourceLanguage) return chapter.sourceBody;
  return chapter.translationBody ?? chapter.sourceBody;
}

export function hasTranslation(chapter: ChapterRow, lang: ChapterLang): boolean {
  if (lang === chapter.sourceLanguage) return true;
  return chapter.translationBody !== undefined;
}
