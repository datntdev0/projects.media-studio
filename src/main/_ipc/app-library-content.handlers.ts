import { ipcMain } from 'electron';
import { APP_LIBRARY_CONTENT_IPC_CHANNELS, type CreateAppLibraryContentInput, type ListAppLibraryContentsFilter, type UpdateAppLibraryContentInput } from '../../shared/app-library-content';
import type { Container } from '../container';

export function registerAppLibraryContentHandlers({ manager }: Container): void {
  ipcMain.handle(APP_LIBRARY_CONTENT_IPC_CHANNELS.list, (_event, libraryId: string, filter?: ListAppLibraryContentsFilter) => manager.appLibraryContent.list(libraryId, filter));
  ipcMain.handle(APP_LIBRARY_CONTENT_IPC_CHANNELS.get, (_event, libraryId: string, id: string) => manager.appLibraryContent.get(libraryId, id) ?? null);
  ipcMain.handle(APP_LIBRARY_CONTENT_IPC_CHANNELS.create, (_event, libraryId: string, input: CreateAppLibraryContentInput) => manager.appLibraryContent.create(libraryId, input));
  ipcMain.handle(APP_LIBRARY_CONTENT_IPC_CHANNELS.update, (_event, libraryId: string, id: string, input: UpdateAppLibraryContentInput) => manager.appLibraryContent.update(libraryId, id, input));
  ipcMain.handle(APP_LIBRARY_CONTENT_IPC_CHANNELS.remove, (_event, libraryId: string, id: string) => manager.appLibraryContent.remove(libraryId, id));
}
