import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import { APP_LIBRARY_PACKAGE_IPC_CHANNELS } from '@/shared/app-library-package';
import type { Container } from '@/main/container';

export function registerAppLibraryPackageHandlers({ manager }: Container): void {
  ipcMain.handle(APP_LIBRARY_PACKAGE_IPC_CHANNELS.exportZip, async (event, libraryId: string) => {
    const { fileName, data } = manager.appLibraryPackage.exportPackage(libraryId);

    // Where the file goes is the user's to pick, so the dialog lives here rather than in the
    // manager — the manager only knows how to package an item, not where a window is.
    const options = { defaultPath: fileName, filters: [{ name: 'Library package', extensions: ['zip'] }] };
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return null;
    }

    fs.writeFileSync(result.filePath, data);
    return result.filePath;
  });

  ipcMain.handle(APP_LIBRARY_PACKAGE_IPC_CHANNELS.inspect, (_event, data: ArrayBuffer) => manager.appLibraryPackage.inspectPackage(Buffer.from(data)));
  ipcMain.handle(APP_LIBRARY_PACKAGE_IPC_CHANNELS.import, (_event, data: ArrayBuffer) => manager.appLibraryPackage.importPackage(Buffer.from(data)));
}
