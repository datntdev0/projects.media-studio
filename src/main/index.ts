import { app } from 'electron';
import started from 'electron-squirrel-startup';
import { closeContainer, createContainer } from './container';
import { registerProtocolHandlers } from './helpers/protocols';
import { runMigrations } from './database/migrate';
import { registerIpcHandlers } from './_ipc';
import { registerQueueHandlers } from './queue';
import { startScheduledJobs } from './scheduler';
import { createMainWindow } from './windows/main-window';
import { closeLogger, getLogFilePath, logger } from './helpers/logger';
import { getAppBaseDir } from './helpers/paths';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

function logStartup(): void {
  logger.info(`Starting ${app.getName()} v${app.getVersion()} (packaged: ${app.isPackaged})`);
  logger.info(`Electron ${process.versions.electron}, Node ${process.versions.node}, ${process.platform}-${process.arch}`);
  logger.info(`Base dir: ${getAppBaseDir()}`);
  logger.info(`Log file: ${getLogFilePath()}`);
}

process.on('uncaughtException', (error) => logger.error('Uncaught exception', error));
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  logStartup();

  registerProtocolHandlers();

  const container = createContainer();
  runMigrations(container.db);

  container.manager.appInfo.init();

  registerQueueHandlers(container);
  registerIpcHandlers(container);
  startScheduledJobs(container);

  createMainWindow();

  logger.info('Startup complete');
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  logger.info('Shutting down');
  closeContainer();
  closeLogger();
});
