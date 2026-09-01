import type { AppInfoApi } from '../shared/app-info';
import type { AppLibraryApi } from '../shared/app-library';
import type { AppLibraryPackageApi } from '../shared/app-library-package';
import type { AppLibraryContentApi } from '../shared/app-library-content';

declare global {
  interface Window {
    appInfoApi: AppInfoApi;
    appLibraryApi: AppLibraryApi;
    appLibraryPackageApi: AppLibraryPackageApi;
    appLibraryContentApi: AppLibraryContentApi;
  }
}

export {};
