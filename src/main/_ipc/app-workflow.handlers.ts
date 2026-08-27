import { ipcMain } from 'electron';
import { APP_WORKFLOW_IPC_CHANNELS } from '../../shared/app-workflow';
import type { Container } from '../container';

export function registerAppWorkflowHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKFLOW_IPC_CHANNELS.list, (_event, filter) => manager.appWorkflow.list(filter));
  ipcMain.handle(APP_WORKFLOW_IPC_CHANNELS.get, (_event, id: string) => manager.appWorkflow.get(id) ?? null);
  ipcMain.handle(APP_WORKFLOW_IPC_CHANNELS.create, (_event, input) => manager.appWorkflow.create(input));
  ipcMain.handle(APP_WORKFLOW_IPC_CHANNELS.update, (_event, id: string, input) => manager.appWorkflow.update(id, input));
  ipcMain.handle(APP_WORKFLOW_IPC_CHANNELS.remove, (_event, id: string) => manager.appWorkflow.remove(id));
  ipcMain.handle(APP_WORKFLOW_IPC_CHANNELS.execute, (_event, id: string) => manager.appWorkflow.execute(id));
}
