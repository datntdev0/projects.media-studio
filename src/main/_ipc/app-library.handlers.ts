import { ipcMain } from 'electron';
import { APP_LIBRARY_IPC_CHANNELS } from '../../shared/app-library';
import type { Container } from '../container';

export function registerAppLibraryHandlers({ manager }: Container): void {
  ipcMain.handle(APP_LIBRARY_IPC_CHANNELS.list, (_event, filter) => manager.appLibrary.list(filter));
  ipcMain.handle(APP_LIBRARY_IPC_CHANNELS.get, (_event, id: string) => manager.appLibrary.get(id) ?? null);
  ipcMain.handle(APP_LIBRARY_IPC_CHANNELS.create, (_event, input) => manager.appLibrary.create(input));
  ipcMain.handle(APP_LIBRARY_IPC_CHANNELS.update, (_event, id: string, input) => manager.appLibrary.update(id, input));
  ipcMain.handle(APP_LIBRARY_IPC_CHANNELS.remove, (_event, id: string) => manager.appLibrary.remove(id));
  ipcMain.handle(APP_LIBRARY_IPC_CHANNELS.uploadCover, (_event, fileName: string, contentType: string, data: ArrayBuffer) =>
    manager.appLibrary.uploadCover(fileName, contentType, Buffer.from(data)),
  );
}
