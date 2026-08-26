// Types and IPC contract for the scraping feature — crawler discovery and
// source previewing that back the "From a crawler" creation flow in the
// library dialog. Shared between the main process, the preload bridge, and
// the renderer for the same reason as `app-library.ts`.

import type { AppLibraryType } from './app-library';

/** One crawler this app knows how to run, and which library type it feeds. */
export interface CrawlerDescriptor {
  name: string;
  baseUrl: string;
  libraryType: AppLibraryType;
  defaultLanguage: string;
}

export interface ScrapingPreviewNovel {
  id: string;
  url: string;
  crawler: string;
  title: string;
  author: string | null;
  category: string | null;
  status: string | null;
  updatedAt: string | null;
  coverUrl: string | null;
  description: string | null;
}

/** What a source URL resolved to, as read by `preview` from the worker. */
export interface ScrapingPreview {
  crawler: string;
  sourceUrl: string;
  novel: ScrapingPreviewNovel;
  chapterCount: number;
  latestChapterTitle: string | null;
  latestChapterUrl: string | null;
}

/** What checking a library item's source for new chapter links found — no content is downloaded. */
export interface DiscoverResult {
  crawler: string;
  sourceUrl: string;
  totalChapters: number;
  newChapters: number;
  latestChapterTitle: string | null;
}

export const APP_SCRAPING_IPC_CHANNELS = {
  getCrawlers: 'app-scraping:get-crawlers',
  preview: 'app-scraping:preview',
  discover: 'app-scraping:discover',
} as const;

export interface AppScrapingApi {
  getCrawlers(libraryType?: AppLibraryType): Promise<CrawlerDescriptor[]>;
  preview(crawler: string, sourceUrl: string): Promise<ScrapingPreview>;
  /** Checks a crawler-sourced novel's source for chapter links not yet on file, and records them as `Discovered` content rows. */
  discover(libraryId: string): Promise<DiscoverResult>;
}
