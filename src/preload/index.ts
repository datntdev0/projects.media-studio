// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';
import { APP_INFO_IPC_CHANNELS, type AppInfoApi } from '../shared/app-info';
import { APP_LIBRARY_IPC_CHANNELS, type AppLibraryApi } from '../shared/app-library';
import { APP_LIBRARY_PACKAGE_IPC_CHANNELS, type AppLibraryPackageApi } from '../shared/app-library-package';
import { APP_LIBRARY_CONTENT_IPC_CHANNELS, type AppLibraryContentApi } from '../shared/app-library-content';

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

const appLibraryPackageApi: AppLibraryPackageApi = {
  exportZip: (libraryId) => ipcRenderer.invoke(APP_LIBRARY_PACKAGE_IPC_CHANNELS.exportZip, libraryId),
  inspect: (data) => ipcRenderer.invoke(APP_LIBRARY_PACKAGE_IPC_CHANNELS.inspect, data),
  import: (data) => ipcRenderer.invoke(APP_LIBRARY_PACKAGE_IPC_CHANNELS.import, data),
};

const appLibraryContentApi: AppLibraryContentApi = {
  list: (libraryId, filter) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.list, libraryId, filter),
  get: (libraryId, id) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.get, libraryId, id),
  create: (libraryId, input) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.create, libraryId, input),
  update: (libraryId, id, input) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.update, libraryId, id, input),
  remove: (libraryId, id) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.remove, libraryId, id),
};

contextBridge.exposeInMainWorld('appInfoApi', appInfoApi);
contextBridge.exposeInMainWorld('appLibraryApi', appLibraryApi);
contextBridge.exposeInMainWorld('appLibraryPackageApi', appLibraryPackageApi);
contextBridge.exposeInMainWorld('appLibraryContentApi', appLibraryContentApi);
