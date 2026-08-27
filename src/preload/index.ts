// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';
import { APP_INFO_IPC_CHANNELS, type AppInfoApi } from '../shared/app-info';
import { APP_LIBRARY_IPC_CHANNELS, type AppLibraryApi } from '../shared/app-library';
import { APP_SCRAPING_IPC_CHANNELS, type AppScrapingApi } from '../shared/app-scraping';
import { APP_LIBRARY_CONTENT_IPC_CHANNELS, type AppLibraryContentApi } from '../shared/app-library-content';
import { APP_WORKFLOW_IPC_CHANNELS, type AppWorkflowApi } from '../shared/app-workflow';
import { APP_WORKFLOW_ACTIVITY_IPC_CHANNELS, type AppWorkflowActivityApi } from '../shared/app-workflow-activity';
import { APP_WORKFLOW_HISTORY_IPC_CHANNELS, type AppWorkflowHistoryApi } from '../shared/app-workflow-history';

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
  discover: (libraryId) => ipcRenderer.invoke(APP_SCRAPING_IPC_CHANNELS.discover, libraryId),
  listJobs: (filter) => ipcRenderer.invoke(APP_SCRAPING_IPC_CHANNELS.listJobs, filter),
  createJob: (input) => ipcRenderer.invoke(APP_SCRAPING_IPC_CHANNELS.createJob, input),
  removeJob: (id) => ipcRenderer.invoke(APP_SCRAPING_IPC_CHANNELS.removeJob, id),
  updateJobStatus: (id, status) => ipcRenderer.invoke(APP_SCRAPING_IPC_CHANNELS.updateJobStatus, id, status),
};

const appLibraryContentApi: AppLibraryContentApi = {
  list: (libraryId, filter) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.list, libraryId, filter),
  get: (libraryId, id) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.get, libraryId, id),
  create: (libraryId, input) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.create, libraryId, input),
  update: (libraryId, id, input) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.update, libraryId, id, input),
  remove: (libraryId, id) => ipcRenderer.invoke(APP_LIBRARY_CONTENT_IPC_CHANNELS.remove, libraryId, id),
};

const appWorkflowApi: AppWorkflowApi = {
  list: (filter) => ipcRenderer.invoke(APP_WORKFLOW_IPC_CHANNELS.list, filter),
  get: (id) => ipcRenderer.invoke(APP_WORKFLOW_IPC_CHANNELS.get, id),
  create: (input) => ipcRenderer.invoke(APP_WORKFLOW_IPC_CHANNELS.create, input),
  update: (id, input) => ipcRenderer.invoke(APP_WORKFLOW_IPC_CHANNELS.update, id, input),
  remove: (id) => ipcRenderer.invoke(APP_WORKFLOW_IPC_CHANNELS.remove, id),
  execute: (id) => ipcRenderer.invoke(APP_WORKFLOW_IPC_CHANNELS.execute, id),
};

const appWorkflowActivityApi: AppWorkflowActivityApi = {
  list: (workflowId) => ipcRenderer.invoke(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.list, workflowId),
  create: (workflowId, input) => ipcRenderer.invoke(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.create, workflowId, input),
  update: (workflowId, id, input) => ipcRenderer.invoke(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.update, workflowId, id, input),
  remove: (workflowId, id) => ipcRenderer.invoke(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.remove, workflowId, id),
  getAnalyzeOutput: (workflowId, id) => ipcRenderer.invoke(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeOutput, workflowId, id),
  getAnalyzeProgress: (workflowId, id) => ipcRenderer.invoke(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeProgress, workflowId, id),
  getAnalyzeCharacters: (workflowId, id, offset, limit) => ipcRenderer.invoke(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeCharacters, workflowId, id, offset, limit),
  getAnalyzeGlossary: (workflowId, id, offset, limit) => ipcRenderer.invoke(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeGlossary, workflowId, id, offset, limit),
  getAnalyzeTimeline: (workflowId, id, offset, limit) => ipcRenderer.invoke(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeTimeline, workflowId, id, offset, limit),
};

contextBridge.exposeInMainWorld('appInfoApi', appInfoApi);
contextBridge.exposeInMainWorld('appLibraryApi', appLibraryApi);
contextBridge.exposeInMainWorld('appScrapingApi', appScrapingApi);
contextBridge.exposeInMainWorld('appLibraryContentApi', appLibraryContentApi);
const appWorkflowHistoryApi: AppWorkflowHistoryApi = {
  listRuns: (workflowId) => ipcRenderer.invoke(APP_WORKFLOW_HISTORY_IPC_CHANNELS.listRuns, workflowId),
};

contextBridge.exposeInMainWorld('appWorkflowApi', appWorkflowApi);
contextBridge.exposeInMainWorld('appWorkflowActivityApi', appWorkflowActivityApi);
contextBridge.exposeInMainWorld('appWorkflowHistoryApi', appWorkflowHistoryApi);
