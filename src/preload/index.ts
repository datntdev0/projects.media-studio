// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';
import { APP_INFO_IPC_CHANNELS, type AppInfoApi } from '../shared/app-info';
import { APP_LIBRARY_IPC_CHANNELS, type AppLibraryApi } from '../shared/app-library';
import { APP_SCRAPING_IPC_CHANNELS, type AppScrapingApi } from '../shared/app-scraping';

const appInfoApi: AppInfoApi = {
  get: () => ipcRenderer.invoke(APP_INFO_IPC_CHANNELS.get),
};

const appLibraryApi: AppLibraryApi = {
  list: (filter) => ipcRenderer.invoke(APP_LIBRARY_IPC_CHANNELS.list, filter),
  get: (id) => ipcRenderer.invoke(APP_LIBRARY_IPC_CHANNELS.get, id),
  create: (input) => ipcRenderer.invoke(APP_LIBRARY_IPC_CHANNELS.create, input),
  update: (id, input) => ipcRenderer.invoke(APP_LIBRARY_IPC_CHANNELS.update, id, input),
  remove: (id) => ipcRenderer.invoke(APP_LIBRARY_IPC_CHANNELS.remove, id),
  uploadCover: (fileName, contentType, data) => ipcRenderer.invoke(APP_LIBRARY_IPC_CHANNELS.uploadCover, fileName, contentType, data),
};

const appScrapingApi: AppScrapingApi = {
  getCrawlers: (libraryType) => ipcRenderer.invoke(APP_SCRAPING_IPC_CHANNELS.getCrawlers, libraryType),
  preview: (crawler, sourceUrl) => ipcRenderer.invoke(APP_SCRAPING_IPC_CHANNELS.preview, crawler, sourceUrl),
};

contextBridge.exposeInMainWorld('appInfoApi', appInfoApi);
contextBridge.exposeInMainWorld('appLibraryApi', appLibraryApi);
contextBridge.exposeInMainWorld('appScrapingApi', appScrapingApi);
