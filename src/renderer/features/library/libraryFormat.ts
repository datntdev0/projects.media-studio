import { AppLibraryStatus, AppLibraryType, LibrarySourceMode, type AppLibrary, type AppLibraryMetadataBase } from '../../../shared/app-library';

export const TYPE_LABEL: Record<AppLibraryType, string> = {
  [AppLibraryType.Novel]: 'Novel',
  [AppLibraryType.Image]: 'Images',
  [AppLibraryType.Video]: 'Videos',
};

export const SOURCE_MODE_LABEL: Record<LibrarySourceMode, string> = {
  [LibrarySourceMode.Manual]: 'Manual',
  [LibrarySourceMode.Crawler]: 'Crawler',
};

export const STATUS_TAG_CLASS: Record<AppLibraryStatus, string> = {
  [AppLibraryStatus.Draft]: 'tag-neutral',
  [AppLibraryStatus.Scraping]: 'tag-accent',
  [AppLibraryStatus.Ready]: 'tag-primary',
  [AppLibraryStatus.Failed]: 'tag-outline',
};

export function metadataOf(item: AppLibrary): AppLibraryMetadataBase | null {
  return item.novelMetadata ?? item.imageMetadata ?? item.videoMetadata;
}

export function summaryOf(item: AppLibrary): string {
  if (item.novelMetadata) return item.novelMetadata.author;
  return item.sourceName;
}

export function contentUnitOf(item: AppLibrary): string {
  return item.type === AppLibraryType.Novel ? 'ch.' : item.type === AppLibraryType.Image ? 'images' : 'clips';
}

export function contentLabelOf(item: AppLibrary): string {
  const metadata = metadataOf(item);
  if (!metadata) return '—';
  const held = metadata.downloadedCount < metadata.discoveredCount ? `${metadata.downloadedCount} / ${metadata.discoveredCount}` : `${metadata.downloadedCount}`;
  return `${held} ${contentUnitOf(item)}`;
}

export function progressPctOf(item: AppLibrary): number {
  const metadata = metadataOf(item);
  if (!metadata || metadata.discoveredCount === 0) return 0;
  return Math.round((metadata.downloadedCount / metadata.discoveredCount) * 100);
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}
