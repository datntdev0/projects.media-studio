import { useCallback, useEffect, useState } from 'react';
import { AppLibraryContentStatus, AppLibraryContentType, type ContentLanguage, type AppLibraryContent } from '@/shared/app-library-content';
import type { ChapterRow } from './chapter';

export interface UseLibraryContentsResult {
  contents: AppLibraryContent[];
  loading: boolean;
  addChapter(title: string, sourceLanguage: ContentLanguage): Promise<void>;
  saveChapter(chapter: ChapterRow, lang: ContentLanguage, title: string, body: string): Promise<void>;
  removeChapter(chapter: ChapterRow): Promise<void>;
  removeChapters(chapters: ChapterRow[]): Promise<void>;
}

export function useLibraryContents(libraryId: string): UseLibraryContentsResult {
  const [contents, setContents] = useState<AppLibraryContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(
    (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      return window.appLibraryContentApi
        .list(libraryId)
        .then((list) => setContents(list))
        .finally(() => {
          if (showLoading) setLoading(false);
        });
    },
    [libraryId],
  );

  useEffect(() => {
    load(true);
  }, [load, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const addChapter = useCallback(
    async (title: string, sourceLanguage: ContentLanguage) => {
      const nextIdx = contents.length === 0 ? 1 : Math.max(...contents.map((c) => c.idx)) + 1;
      await window.appLibraryContentApi.create(libraryId, {
        idx: nextIdx,
        type: AppLibraryContentType.Original,
        status: AppLibraryContentStatus.Pending,
        textContent: { body: '', language: sourceLanguage, title },
        imageContent: null,
        videoContent: null,
      });
      refresh();
    },
    [libraryId, contents, refresh],
  );

  /**
   * One write per affected row, each carrying the up-to-date title — never two sequential full-replace
   * writes to the same row, since the second would clobber whatever the first just changed.
   */
  const saveChapter = useCallback(
    async (chapter: ChapterRow, lang: ContentLanguage, title: string, body: string) => {
      const original = contents.find((c) => c.id === chapter.id);

      if (lang === chapter.sourceLanguage) {
        const status = body.trim() === '' ? AppLibraryContentStatus.Pending : AppLibraryContentStatus.Completed;
        await window.appLibraryContentApi.update(libraryId, chapter.id, {
          idx: chapter.no,
          type: AppLibraryContentType.Original,
          status,
          textContent: { body, language: lang, title },
          imageContent: null,
          videoContent: null,
        });
      } else {
        if (title !== chapter.title && original?.textContent) {
          await window.appLibraryContentApi.update(libraryId, chapter.id, {
            idx: original.idx,
            type: AppLibraryContentType.Original,
            status: original.status,
            textContent: { ...original.textContent, title },
            imageContent: null,
            videoContent: null,
          });
        }

        const translationStatus = body.trim() === '' ? AppLibraryContentStatus.Pending : AppLibraryContentStatus.Completed;
        const translationInput = {
          idx: chapter.no,
          type: AppLibraryContentType.Translation,
          status: translationStatus,
          textContent: { body, language: lang, title },
          imageContent: null,
          videoContent: null,
        };
        if (chapter.translationId) {
          await window.appLibraryContentApi.update(libraryId, chapter.translationId, translationInput);
        } else {
          await window.appLibraryContentApi.create(libraryId, translationInput);
        }
      }
      refresh();
    },
    [libraryId, contents, refresh],
  );

  const removeChapter = useCallback(
    async (chapter: ChapterRow) => {
      const siblings = contents.filter((c) => c.idx === chapter.no);
      await Promise.all(siblings.map((c) => window.appLibraryContentApi.remove(libraryId, c.id)));
      refresh();
    },
    [libraryId, contents, refresh],
  );

  const removeChapters = useCallback(
    async (chapters: ChapterRow[]) => {
      const idxSet = new Set(chapters.map((c) => c.no));
      const siblings = contents.filter((c) => idxSet.has(c.idx));
      await Promise.all(siblings.map((c) => window.appLibraryContentApi.remove(libraryId, c.id)));
      refresh();
    },
    [libraryId, contents, refresh],
  );

  return { contents, loading, addChapter, saveChapter, removeChapter, removeChapters };
}
