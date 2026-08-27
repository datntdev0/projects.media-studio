import { ipcMain } from 'electron';
import { APP_WORKFLOW_HISTORY_IPC_CHANNELS } from '../../shared/app-workflow-history';
import type { Container } from '../container';

export function registerAppWorkflowHistoryHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKFLOW_HISTORY_IPC_CHANNELS.listRuns, (_event, workflowId: string) => manager.appWorkflowHistory.listRuns(workflowId));
}
