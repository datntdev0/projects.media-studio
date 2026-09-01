import type { Db } from '@/main/database/client';
import { buildLibraryPackage, importLibraryPackage, previewLibraryPackage } from '@/main/helpers/library-package';
import type { LibraryPackagePreview } from '@/shared/app-library-package';

export interface AppLibraryPackageManager {
  /** The archive one library item packages into — its bytes, and the name it should be offered under. */
  exportPackage(libraryId: string): { fileName: string; data: Buffer };
  /** What importing an archive would create, read without writing anything. */
  inspectPackage(data: Buffer): LibraryPackagePreview;
  /** Creates a new library item from an archive. Returns the new item's id. */
  importPackage(data: Buffer): string;
}

export function createAppLibraryPackageManager(db: Db): AppLibraryPackageManager {
  return {
    exportPackage: (libraryId) => buildLibraryPackage(db, libraryId),
    inspectPackage: (data) => previewLibraryPackage(data),
    importPackage: (data) => importLibraryPackage(db, data),
  };
}
