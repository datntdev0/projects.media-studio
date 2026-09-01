import { AppLibraryType, type AppLibrary } from '@/shared/app-library';
import { NovelDetailScreen } from './NovelDetailScreen';
import { GalleryDetailScreen } from './GalleryDetailScreen';

interface LibraryDetailScreenProps {
  item: AppLibrary;
  onBack(): void;
  onEdit(): void;
  onDelete(): void;
  /** The item's counters (e.g. chapter counts) change server-side as content is added/edited/removed — call this to refresh the list behind this screen. */
  onContentChange(): void;
}

export function LibraryDetailScreen({ item, onBack, onEdit, onDelete, onContentChange }: LibraryDetailScreenProps) {
  return item.type === AppLibraryType.Novel ? (
    <NovelDetailScreen item={item} onBack={onBack} onEdit={onEdit} onDelete={onDelete} onContentChange={onContentChange} />
  ) : (
    <GalleryDetailScreen item={item} onBack={onBack} onEdit={onEdit} onDelete={onDelete} />
  );
}
