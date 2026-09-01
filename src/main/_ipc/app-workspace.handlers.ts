import { ipcMain } from 'electron';
import { APP_WORKSPACE_IPC_CHANNELS } from '@/shared/app-workspace';
import type { Container } from '@/main/container';

export function registerAppWorkspaceHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKSPACE_IPC_CHANNELS.list, (_event, filter) => manager.appWorkspace.list(filter));
  ipcMain.handle(APP_WORKSPACE_IPC_CHANNELS.get, (_event, id: string) => manager.appWorkspace.get(id) ?? null);
  ipcMain.handle(APP_WORKSPACE_IPC_CHANNELS.create, (_event, input) => manager.appWorkspace.create(input));
  ipcMain.handle(APP_WORKSPACE_IPC_CHANNELS.update, (_event, id: string, input) => manager.appWorkspace.update(id, input));
  ipcMain.handle(APP_WORKSPACE_IPC_CHANNELS.remove, (_event, id: string) => manager.appWorkspace.remove(id));
}
