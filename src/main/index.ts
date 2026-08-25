import { app } from 'electron';
import started from 'electron-squirrel-startup';
import { closeContainer, createContainer } from './container';
import { runMigrations } from './db/migrate';
import { registerIpcHandlers } from './ipc';
import { createMainWindow } from './windows/main-window';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  const container = createContainer();
  runMigrations(container.db);

  container.manager.appInfo.init();

  registerIpcHandlers(container);

  createMainWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  closeContainer();
});
