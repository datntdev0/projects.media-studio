import type { AppInfoApi } from '../shared/app-info';
import type { AppLibraryApi } from '../shared/app-library';
import type { AppScrapingApi } from '../shared/app-scraping';
import type { AppLibraryContentApi } from '../shared/app-library-content';

declare global {
  interface Window {
    appInfoApi: AppInfoApi;
    appLibraryApi: AppLibraryApi;
    appScrapingApi: AppScrapingApi;
    appLibraryContentApi: AppLibraryContentApi;
  }
}

export {};
