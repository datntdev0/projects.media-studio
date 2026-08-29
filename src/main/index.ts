import { app } from 'electron';
import started from 'electron-squirrel-startup';
import './helpers/logger';
import { closeContainer, createContainer } from './container';
import { registerCoverProtocolHandler } from './helpers/protocols/cover.protocol';
import { registerTtsSampleProtocolHandler } from './helpers/protocols/tts-sample.protocol';
import { registerTtsOutputProtocolHandler } from './helpers/protocols/tts-output.protocol';
import { registerExportVideoImageProtocolHandler } from './helpers/protocols/export-video-image.protocol';
import { registerExportVideoOutputProtocolHandler } from './helpers/protocols/export-video-output.protocol';
import { runMigrations } from './database/migrate';
import { registerIpcHandlers } from './_ipc';
import { registerQueueHandlers } from './queue';
import { startScheduledJobs } from './scheduler';
import { createMainWindow } from './windows/main-window';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  registerCoverProtocolHandler();
  registerTtsSampleProtocolHandler();
  registerTtsOutputProtocolHandler();
  registerExportVideoImageProtocolHandler();
  registerExportVideoOutputProtocolHandler();

  const container = createContainer();
  runMigrations(container.db);

  container.manager.appInfo.init();

  registerIpcHandlers(container);
  registerQueueHandlers(container);
  startScheduledJobs(container);

  createMainWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  closeContainer();
});
