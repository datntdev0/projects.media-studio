import { ipcMain } from 'electron';
import { APP_WORKFLOW_ACTIVITY_IPC_CHANNELS } from '../../shared/app-workflow-activity';
import type { Container } from '../container';

export function registerAppWorkflowActivityHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.list, (_event, workflowId: string) => manager.appWorkflowActivity.list(workflowId));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.create, (_event, workflowId: string, input) => manager.appWorkflowActivity.create(workflowId, input));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.update, (_event, workflowId: string, id: string, input) => manager.appWorkflowActivity.update(workflowId, id, input));
  ipcMain.handle(APP_WORKFLOW_ACTIVITY_IPC_CHANNELS.remove, (_event, workflowId: string, id: string) => manager.appWorkflowActivity.remove(workflowId, id));
}
