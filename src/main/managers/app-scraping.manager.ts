import { randomUUID } from 'node:crypto';
import type { Db } from '../database/client';
import { setSystemCacheItem } from '../database/repositories/system-cache.repo';
import { COVER_EXTENSION_BY_CONTENT_TYPE, writeCoverFile } from '../helpers/cover-storage';
import { getAppLibrary } from '../database/repositories/app-library.repo';
import { createAppLibraryContent, listAppLibraryContents } from '../database/repositories/app-library-content.repo';
import { recount } from './app-library-content.manager';
import { AppLibraryType, LibrarySourceMode } from '../../shared/app-library';
import { AppLibraryContentStatus, AppLibraryContentType, ContentLanguage } from '../../shared/app-library-content';
import type { CrawlerDescriptor, DiscoverResult, ScrapingPreview } from '../../shared/app-scraping';

export interface AppScrapingManager {
  getCrawlers(libraryType?: AppLibraryType): CrawlerDescriptor[];
  preview(crawler: string, sourceUrl: string): Promise<ScrapingPreview>;
  discover(libraryId: string): Promise<DiscoverResult>;
}

/** The crawlers the worker service knows how to run, and which library type each one feeds. */
const CRAWLERS: CrawlerDescriptor[] = [
  { name: 'novel543', baseUrl: 'https://www.novel543.com', libraryType: AppLibraryType.Novel, defaultLanguage: 'zh' },
];

const CACHE_TYPE = 'scraping-preview';
const PREVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// The worker's response shapes (see src/worker/app/models.py) — camelCase over the wire.
interface WorkerNovel {
  id: string;
  url: string;
  crawler: string;
  title?: string | null;
  author?: string | null;
  category?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  coverUrl?: string | null;
  description?: string | null;
}

interface WorkerChapter {
  index: number;
  title: string;
  url: string;
}

function workerBaseUrl(): string {
  return process.env.SCRAPER_BASE_URL ?? 'http://127.0.0.1:8000';
}

/** Matches a novel's stored language onto one of the three languages content rows carry; falls back to the crawler's default. */
function resolveLanguage(language: string | undefined, fallback: string): ContentLanguage {
  const key = (language || fallback).trim().toLowerCase();
  return (Object.values(ContentLanguage) as string[]).includes(key) ? (key as ContentLanguage) : ContentLanguage.English;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Worker request to ${url} failed with ${response.status}: ${detail || response.statusText}`);
  }
  return (await response.json()) as T;
}

/** Downloads the cover's bytes through the worker and saves them to disk under a generated name; null when the book has no cover. */
async function fetchCoverFile(base: string, crawler: string, sourceUrl: string): Promise<string | null> {
  const response = await fetch(`${base}/novels/${crawler}/cover?sourceUrl=${encodeURIComponent(sourceUrl)}`);
  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get('content-type')?.split(';')[0].trim() ?? '';
  const extension = COVER_EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'jpg';
  const fileName = `${randomUUID()}.${extension}`;

  return writeCoverFile(fileName, Buffer.from(await response.arrayBuffer()));
}

async function fetchPreviewFromWorker(crawler: string, sourceUrl: string): Promise<ScrapingPreview> {
  const query = `sourceUrl=${encodeURIComponent(sourceUrl)}`;
  const base = workerBaseUrl();

  const [novel, chapters, coverPath] = await Promise.all([
    fetchJson<WorkerNovel>(`${base}/novels/${crawler}/metadata?${query}`),
    fetchJson<WorkerChapter[]>(`${base}/novels/${crawler}/chapters?${query}`),
    fetchCoverFile(base, crawler, sourceUrl).catch(() => null),
  ]);
  const latestChapter = chapters.at(-1);

  return {
    crawler,
    sourceUrl,
    novel: {
      id: novel.id,
      url: novel.url,
      crawler: novel.crawler,
      title: novel.title ?? '',
      author: novel.author ?? null,
      category: novel.category ?? null,
      status: novel.status ?? null,
      updatedAt: novel.updatedAt ?? null,
      coverUrl: coverPath,
      description: novel.description ?? null,
    },
    chapterCount: chapters.length,
    latestChapterTitle: latestChapter?.title ?? null,
    latestChapterUrl: latestChapter?.url ?? null,
  };
}

export function createAppScrapingManager(db: Db): AppScrapingManager {
  return {
    getCrawlers: (libraryType) => CRAWLERS.filter((crawler) => libraryType === undefined || crawler.libraryType === libraryType),

    preview: async (crawler, sourceUrl) => {
      const descriptor = CRAWLERS.find((candidate) => candidate.name === crawler);
      if (!descriptor) {
        const known = CRAWLERS.map((candidate) => candidate.name).join(', ');
        throw new Error(`Unknown crawler '${crawler}'. Available: ${known}`);
      }

      const preview = await fetchPreviewFromWorker(crawler, sourceUrl);
      const cacheKey = `${crawler}:${sourceUrl}`;
      setSystemCacheItem(db, { cacheType: CACHE_TYPE, cacheKey, cacheDataJson: JSON.stringify(preview), ttl: PREVIEW_TTL_MS });
      return preview;
    },

    discover: async (libraryId) => {
      const item = getAppLibrary(db, libraryId);
      if (!item) {
        throw new Error(`Library item ${libraryId} not found`);
      }
      if (item.type !== AppLibraryType.Novel) {
        throw new Error('Only novel items can discover chapters.');
      }
      if (item.sourceMode !== LibrarySourceMode.Crawler || !item.sourceUrl) {
        throw new Error('This item has no crawler source to discover chapters from.');
      }

      const crawler = item.sourceName;
      const descriptor = CRAWLERS.find((candidate) => candidate.name === crawler);
      if (!descriptor) {
        const known = CRAWLERS.map((candidate) => candidate.name).join(', ');
        throw new Error(`Unknown crawler '${crawler}'. Available: ${known}`);
      }

      const query = `sourceUrl=${encodeURIComponent(item.sourceUrl)}`;
      const chapters = await fetchJson<WorkerChapter[]>(`${workerBaseUrl()}/novels/${crawler}/chapters?${query}`);

      const existing = listAppLibraryContents(db, libraryId, { type: AppLibraryContentType.Original });
      const knownUrls = new Set(existing.map((content) => content.sourceUrl).filter((url): url is string => url != null));
      const freshChapters = chapters.filter((chapter) => !knownUrls.has(chapter.url));

      const language = resolveLanguage(item.novelMetadata?.language, descriptor.defaultLanguage);
      let nextIdx = existing.length === 0 ? 1 : Math.max(...existing.map((content) => content.idx)) + 1;

      for (const chapter of freshChapters) {
        createAppLibraryContent(db, libraryId, {
          idx: nextIdx++,
          type: AppLibraryContentType.Original,
          status: AppLibraryContentStatus.Discovered,
          sourceUrl: chapter.url,
          textContent: { contentUrl: null, body: '', language, title: chapter.title, words: 0 },
          audioContent: null,
          imageContent: null,
          videoContent: null,
        });
      }

      if (freshChapters.length > 0) {
        recount(db, libraryId);
      }

      return {
        crawler,
        sourceUrl: item.sourceUrl,
        totalChapters: chapters.length,
        newChapters: freshChapters.length,
        latestChapterTitle: chapters.at(-1)?.title ?? null,
      };
    },
  };
}
