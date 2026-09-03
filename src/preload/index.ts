// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';
import { APP_INFO_IPC_CHANNELS, type AppInfoApi } from '@/shared/app-info';
import { APP_LIBRARY_IPC_CHANNELS, type AppLibraryApi } from '@/shared/app-library';
import { APP_LIBRARY_PACKAGE_IPC_CHANNELS, type AppLibraryPackageApi } from '@/shared/app-library-package';
import { APP_LIBRARY_CONTENT_IPC_CHANNELS, type AppLibraryContentApi } from '@/shared/app-library-content';
import { APP_WORKSPACE_IPC_CHANNELS, type AppWorkspaceApi } from '@/shared/app-workspace';
import { APP_WORKSPACE_RUN_IPC_CHANNELS, type AppWorkspaceRunApi } from '@/shared/app-workspace-run';
import { APP_WORKSPACE_EXTRACTION_IPC_CHANNELS, type AppWorkspaceExtractionApi } from '@/shared/app-workspace-extraction';
import { APP_WORKSPACE_TRANSLATION_IPC_CHANNELS, type AppWorkspaceTranslationApi } from '@/shared/app-workspace-translation';
import { APP_WORKSPACE_NARRATION_IPC_CHANNELS, type AppWorkspaceNarrationApi } from '@/shared/app-workspace-narration';

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

const appWorkspaceApi: AppWorkspaceApi = {
  list: (filter) => ipcRenderer.invoke(APP_WORKSPACE_IPC_CHANNELS.list, filter),
  get: (id) => ipcRenderer.invoke(APP_WORKSPACE_IPC_CHANNELS.get, id),
  create: (input) => ipcRenderer.invoke(APP_WORKSPACE_IPC_CHANNELS.create, input),
  update: (id, input) => ipcRenderer.invoke(APP_WORKSPACE_IPC_CHANNELS.update, id, input),
  remove: (id) => ipcRenderer.invoke(APP_WORKSPACE_IPC_CHANNELS.remove, id),
};

const appWorkspaceRunApi: AppWorkspaceRunApi = {
  list: (workspaceId) => ipcRenderer.invoke(APP_WORKSPACE_RUN_IPC_CHANNELS.list, workspaceId),
  submit: (input) => ipcRenderer.invoke(APP_WORKSPACE_RUN_IPC_CHANNELS.submit, input),
  cancel: (id) => ipcRenderer.invoke(APP_WORKSPACE_RUN_IPC_CHANNELS.cancel, id),
  clear: (workspaceId) => ipcRenderer.invoke(APP_WORKSPACE_RUN_IPC_CHANNELS.clear, workspaceId),
};

const appWorkspaceExtractionApi: AppWorkspaceExtractionApi = {
  read: (workspaceId) => ipcRenderer.invoke(APP_WORKSPACE_EXTRACTION_IPC_CHANNELS.read, workspaceId),
  save: (workspaceId, world) => ipcRenderer.invoke(APP_WORKSPACE_EXTRACTION_IPC_CHANNELS.save, workspaceId, world),
  rebuild: (workspaceId) => ipcRenderer.invoke(APP_WORKSPACE_EXTRACTION_IPC_CHANNELS.rebuild, workspaceId),
  setLlm: (workspaceId, llm) => ipcRenderer.invoke(APP_WORKSPACE_EXTRACTION_IPC_CHANNELS.setLlm, workspaceId, llm),
};

const appWorkspaceTranslationApi: AppWorkspaceTranslationApi = {
  read: (workspaceId) => ipcRenderer.invoke(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.read, workspaceId),
  save: (workspaceId, world) => ipcRenderer.invoke(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.save, workspaceId, world),
  translateMetadata: (workspaceId) => ipcRenderer.invoke(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.translateMetadata, workspaceId),
  distribute: (workspaceId) => ipcRenderer.invoke(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.distribute, workspaceId),
  readChapter: (workspaceId, chapterNo) => ipcRenderer.invoke(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.readChapter, workspaceId, chapterNo),
  saveChapter: (workspaceId, chapterNo, body) => ipcRenderer.invoke(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.saveChapter, workspaceId, chapterNo, body),
};

const appWorkspaceNarrationApi: AppWorkspaceNarrationApi = {
  read: (workspaceId) => ipcRenderer.invoke(APP_WORKSPACE_NARRATION_IPC_CHANNELS.read, workspaceId),
  setSpeech: (workspaceId, speech) => ipcRenderer.invoke(APP_WORKSPACE_NARRATION_IPC_CHANNELS.setSpeech, workspaceId, speech),
  readChapter: (workspaceId, chapterNo) => ipcRenderer.invoke(APP_WORKSPACE_NARRATION_IPC_CHANNELS.readChapter, workspaceId, chapterNo),
};

contextBridge.exposeInMainWorld('appInfoApi', appInfoApi);
contextBridge.exposeInMainWorld('appLibraryApi', appLibraryApi);
contextBridge.exposeInMainWorld('appLibraryPackageApi', appLibraryPackageApi);
contextBridge.exposeInMainWorld('appLibraryContentApi', appLibraryContentApi);
contextBridge.exposeInMainWorld('appWorkspaceApi', appWorkspaceApi);
contextBridge.exposeInMainWorld('appWorkspaceRunApi', appWorkspaceRunApi);
contextBridge.exposeInMainWorld('appWorkspaceExtractionApi', appWorkspaceExtractionApi);
contextBridge.exposeInMainWorld('appWorkspaceTranslationApi', appWorkspaceTranslationApi);
contextBridge.exposeInMainWorld('appWorkspaceNarrationApi', appWorkspaceNarrationApi);
