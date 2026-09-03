import type { AppInfoApi } from '@/shared/app-info';
import type { AppLibraryApi } from '@/shared/app-library';
import type { AppLibraryPackageApi } from '@/shared/app-library-package';
import type { AppLibraryContentApi } from '@/shared/app-library-content';
import type { AppWorkspaceApi } from '@/shared/app-workspace';
import type { AppWorkspaceRunApi } from '@/shared/app-workspace-run';
import type { AppWorkspaceExtractionApi } from '@/shared/app-workspace-extraction';
import type { AppWorkspaceTranslationApi } from '@/shared/app-workspace-translation';

declare global {
  interface Window {
    appInfoApi: AppInfoApi;
    appLibraryApi: AppLibraryApi;
    appLibraryPackageApi: AppLibraryPackageApi;
    appLibraryContentApi: AppLibraryContentApi;
    appWorkspaceApi: AppWorkspaceApi;
    appWorkspaceRunApi: AppWorkspaceRunApi;
    appWorkspaceExtractionApi: AppWorkspaceExtractionApi;
    appWorkspaceTranslationApi: AppWorkspaceTranslationApi;
  }
}

export {};
