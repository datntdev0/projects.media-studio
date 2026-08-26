import { randomUUID } from 'node:crypto';
import type { Db } from '../database/client';
import { getSystemCacheItem, setSystemCacheItem } from '../database/repositories/system-cache.repo';
import { COVER_EXTENSION_BY_CONTENT_TYPE, writeCoverFile } from '../helpers/cover-storage';
import { AppLibraryType } from '../../shared/app-library';
import type { CrawlerDescriptor, ScrapingPreview } from '../../shared/app-scraping';

export interface AppScrapingManager {
  getCrawlers(libraryType?: AppLibraryType): CrawlerDescriptor[];
  preview(crawler: string, sourceUrl: string): Promise<ScrapingPreview>;
}

/** The crawlers the worker service knows how to run, and which library type each one feeds. */
const CRAWLERS: CrawlerDescriptor[] = [{ name: 'novel543', baseUrl: 'https://www.novel543.com', libraryType: AppLibraryType.Novel }];

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

      const cacheKey = `${crawler}:${sourceUrl}`;
      const cached = getSystemCacheItem(db, CACHE_TYPE, cacheKey);
      if (cached) {
        return JSON.parse(cached.cacheDataJson) as ScrapingPreview;
      }

      const preview = await fetchPreviewFromWorker(crawler, sourceUrl);
      setSystemCacheItem(db, { cacheType: CACHE_TYPE, cacheKey, cacheDataJson: JSON.stringify(preview), ttl: PREVIEW_TTL_MS });
      return preview;
    },
  };
}
