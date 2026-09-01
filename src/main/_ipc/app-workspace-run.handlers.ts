import { ipcMain } from 'electron';
import { APP_WORKSPACE_RUN_IPC_CHANNELS } from '@/shared/app-workspace-run';
import type { Container } from '@/main/container';

export function registerAppWorkspaceRunHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKSPACE_RUN_IPC_CHANNELS.list, (_event, workspaceId: string) => manager.appWorkspaceRun.list(workspaceId));
  ipcMain.handle(APP_WORKSPACE_RUN_IPC_CHANNELS.submit, (_event, input) => manager.appWorkspaceRun.submit(input));
  ipcMain.handle(APP_WORKSPACE_RUN_IPC_CHANNELS.cancel, (_event, id: string) => manager.appWorkspaceRun.cancel(id));
}
