import { ipcMain } from 'electron';
import { APP_SCRAPING_IPC_CHANNELS } from '../../shared/app-scraping';
import type { AppLibraryType } from '../../shared/app-library';
import type { Container } from '../container';

export function registerAppScrapingHandlers({ manager }: Container): void {
  ipcMain.handle(APP_SCRAPING_IPC_CHANNELS.getCrawlers, (_event, libraryType?: AppLibraryType) => manager.appScraping.getCrawlers(libraryType));
  ipcMain.handle(APP_SCRAPING_IPC_CHANNELS.preview, (_event, crawler: string, sourceUrl: string) => manager.appScraping.preview(crawler, sourceUrl));
}
