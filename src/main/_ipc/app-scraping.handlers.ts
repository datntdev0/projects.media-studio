import { ipcMain } from 'electron';
import { APP_SCRAPING_IPC_CHANNELS, type CreateScrapingJobInput, type ListScrapingJobsFilter, type ScrapingJobStatus } from '../../shared/app-scraping';
import type { AppLibraryType } from '../../shared/app-library';
import type { Container } from '../container';

export function registerAppScrapingHandlers({ manager }: Container): void {
  ipcMain.handle(APP_SCRAPING_IPC_CHANNELS.getCrawlers, (_event, libraryType?: AppLibraryType) => manager.appScraping.getCrawlers(libraryType));
  ipcMain.handle(APP_SCRAPING_IPC_CHANNELS.preview, (_event, crawler: string, sourceUrl: string) => manager.appScraping.preview(crawler, sourceUrl));
  ipcMain.handle(APP_SCRAPING_IPC_CHANNELS.discover, (_event, libraryId: string) => manager.appScraping.discover(libraryId));
  ipcMain.handle(APP_SCRAPING_IPC_CHANNELS.listJobs, (_event, filter?: ListScrapingJobsFilter) => manager.appScraping.listJobs(filter));
  ipcMain.handle(APP_SCRAPING_IPC_CHANNELS.createJob, (_event, input: CreateScrapingJobInput) => manager.appScraping.createJob(input));
  ipcMain.handle(APP_SCRAPING_IPC_CHANNELS.removeJob, (_event, id: string) => manager.appScraping.removeJob(id));
  ipcMain.handle(APP_SCRAPING_IPC_CHANNELS.updateJobStatus, (_event, id: string, status: ScrapingJobStatus) => manager.appScraping.updateJobStatus(id, status));
}
