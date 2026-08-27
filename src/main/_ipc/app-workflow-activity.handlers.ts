import { ipcMain } from 'electron';
import { APP_WORKFLOW_ACTIVITY_IPC_CHANNELS } from '../../shared/app-workflow-activity';
import type { Container } from '../container';

export function registerAppWorkflowActivityHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.list, (_event, workflowId: string) => manager.appWorkflowActivity.list(workflowId));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.create, (_event, workflowId: string, input) => manager.appWorkflowActivity.create(workflowId, input));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.update, (_event, workflowId: string, id: string, input) => manager.appWorkflowActivity.update(workflowId, id, input));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.remove, (_event, workflowId: string, id: string) => manager.appWorkflowActivity.remove(workflowId, id));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeOutput, (_event, workflowId: string, id: string) => manager.appWorkflowActivity.getAnalyzeOutput(workflowId, id));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeProgress, (_event, workflowId: string, id: string) => manager.appWorkflowActivity.getAnalyzeProgress(workflowId, id));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeCharacters, (_event, workflowId: string, id: string, offset: number, limit: number) => manager.appWorkflowActivity.getAnalyzeCharacters(workflowId, id, offset, limit));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeGlossary, (_event, workflowId: string, id: string, offset: number, limit: number) => manager.appWorkflowActivity.getAnalyzeGlossary(workflowId, id, offset, limit));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.getAnalyzeTimeline, (_event, workflowId: string, id: string, offset: number, limit: number) => manager.appWorkflowActivity.getAnalyzeTimeline(workflowId, id, offset, limit));
}
