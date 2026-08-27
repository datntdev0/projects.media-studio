import type { AppInfoApi } from '../shared/app-info';
import type { AppLibraryApi } from '../shared/app-library';
import type { AppScrapingApi } from '../shared/app-scraping';
import type { AppLibraryContentApi } from '../shared/app-library-content';
import type { AppWorkflowApi } from '../shared/app-workflow';
import type { AppWorkflowActivityApi } from '../shared/app-workflow-activity';
import type { AppWorkflowHistoryApi } from '../shared/app-workflow-history';

declare global {
  interface Window {
    appInfoApi: AppInfoApi;
    appLibraryApi: AppLibraryApi;
    appScrapingApi: AppScrapingApi;
    appLibraryContentApi: AppLibraryContentApi;
    appWorkflowApi: AppWorkflowApi;
    appWorkflowActivityApi: AppWorkflowActivityApi;
    appWorkflowHistoryApi: AppWorkflowHistoryApi;
  }
}

export {};
