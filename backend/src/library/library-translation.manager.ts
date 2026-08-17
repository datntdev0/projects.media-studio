import { BadRequestException, Injectable } from '@nestjs/common';
import { UpdateLibraryContentDto } from './dto/library-content-update.dto';
import { LibraryContent, NovelChapter } from './entities/library-content.entity';
import { LibraryItem, LibraryItemType } from './entities/library-item.entity';
import { TRANSLATION_LANGUAGES, TranslatedContent, TranslationCoverage, TranslationLanguage } from './entities/library-translation.entity';
import { LibraryTranslationRepository, TranslationDraft } from './library-translation.repository';

/** Both refusals below are the same fact: only a novel, and only a chapter of one, is translated. */
const NOT_A_NOVEL = 'Only a novel has translations';

/**
 * The rules for reading and writing a novel in another language: which
 * subcollection a language means, what a row looks like once a translation is
 * folded into it, and how much of the novel each language covers.
 *
 * Framework-free apart from `@Injectable()` and the exceptions, and one-directional
 * — this knows nothing of `LibraryContentManager`, which is what calls it.
 */
@Injectable()
export class LibraryTranslationManager {
  constructor(private readonly repository: LibraryTranslationRepository) {}

  /**
   * The rows as the caller should answer with them.
   *
   * With no language this does no I/O at all and marks every row untranslated,
   * which is what lets the content manager end `list` and `get` in one call rather
   * than branching around it.
   */
  async decorate(item: LibraryItem, language: TranslationLanguage | undefined, rows: LibraryContent[]): Promise<TranslatedContent[]> {
    if (!language) {
      return rows.map(untranslated);
    }

    this.requireNovel(item);

    const stored = await this.repository.findByIds(item.id, language, rows.map((row) => row.id));

    return rows.map((row) => merge(row, stored.get(row.id)));
  }

  /**
   * A chapter's translation, written. The upsert is the only way one is created:
   * a translation of a chapter that is not there is not a thing to store.
   */
  async save(item: LibraryItem, language: TranslationLanguage, source: LibraryContent, input: UpdateLibraryContentDto): Promise<TranslatedContent> {
    const chapter = this.requireChapter(item, source);
    const written = await this.repository.upsert(item.id, language, chapter.id, translationDraft(language, chapter, input));

    return merge(chapter, written);
  }

  /**
   * How many chapters each language covers — three rows for a novel, always all
   * three, so the dropdown can say `none yet` without a special case.
   *
   * Null for a set, which has no translations: an empty list would read as a novel
   * nobody has translated, and the two are not the same fact.
   */
  async coverage(item: LibraryItem): Promise<TranslationCoverage[] | null> {
    if (item.type !== LibraryItemType.Novel) {
      return null;
    }

    const counted = await this.repository.counts(item.id);

    return TRANSLATION_LANGUAGES.map((language) => ({ language, translated: counted[language] }));
  }

  /** One chapter's translations go when the chapter does. */
  removeFor(itemId: string, contentId: string): Promise<void> {
    return this.repository.remove(itemId, contentId);
  }

  /** An item's go when the item does. */
  removeAll(itemId: string): Promise<void> {
    return this.repository.removeAll(itemId);
  }

  private requireNovel(item: LibraryItem): void {
    if (item.type !== LibraryItemType.Novel) {
      throw new BadRequestException(NOT_A_NOVEL);
    }
  }

  /** The refusal and the narrowing in one test — a chapter's type is its item's. */
  private requireChapter(item: LibraryItem, source: LibraryContent): NovelChapter {
    if (item.type !== LibraryItemType.Novel || source.type !== LibraryItemType.Novel) {
      throw new BadRequestException(NOT_A_NOVEL);
    }

    return source;
  }
}

/** The row as it stands with no language asked for, or none stored. */
function untranslated(content: LibraryContent): TranslatedContent {
  return { ...content, translated: false, sourceTitle: null };
}

/**
 * The source row, with a translation folded over it where there is one.
 *
 * `index`, `status` and `sourceUrl` are read from the source however old the
 * translation is: all three describe the chapter rather than the text of it, so a
 * stored copy would start lying the moment the chapter was re-scraped. `title`,
 * `words` and `contentUrl` are the translation's own.
 */
function merge(source: LibraryContent, translation: NovelChapter | undefined): TranslatedContent {
  if (!translation || source.type !== LibraryItemType.Novel) {
    return untranslated(source);
  }

  return {
    ...translation,
    index: source.index,
    status: source.status,
    sourceUrl: source.sourceUrl,
    translated: true,
    sourceTitle: source.title,
  };
}

/**
 * What a `PUT ?language=` decides, and what it does not.
 *
 * The two refusals are the ones `LibraryContentManager.chapterBlock` gives a source
 * chapter, deliberately word for word — a translation is a chapter, and being asked
 * for one without a title should not read differently here.
 */
function translationDraft(language: TranslationLanguage, source: NovelChapter, input: UpdateLibraryContentDto): TranslationDraft {
  const title = input.title?.trim();

  if (!title) {
    throw new BadRequestException('A chapter needs a title');
  }

  if (input.filename !== undefined || input.filesize !== undefined) {
    throw new BadRequestException('A chapter is not a file — leave `filename` and `filesize` out');
  }

  // The three copied fields keep the stored document a whole chapter. They are
  // read from the source again on the way out — see `merge`.
  return {
    type: LibraryItemType.Novel,
    title,
    language,
    words: input.words ?? 0,
    contentUrl: input.contentUrl ?? null,
    index: source.index,
    status: source.status,
    sourceUrl: source.sourceUrl,
  };
}
