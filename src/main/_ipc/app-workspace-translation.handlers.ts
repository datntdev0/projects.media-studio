import { ipcMain } from 'electron';
import type { Container } from '@/main/container';
import { APP_WORKSPACE_TRANSLATION_IPC_CHANNELS, type WorldTranslation } from '@/shared/app-workspace-translation';

export function registerAppWorkspaceTranslationHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.read, (_event, workspaceId: string) => manager.appWorkspaceTranslation.read(workspaceId));
  ipcMain.handle(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.save, (_event, workspaceId: string, world: WorldTranslation) => manager.appWorkspaceTranslation.save(workspaceId, world));
  ipcMain.handle(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.translateMetadata, (_event, workspaceId: string) => manager.appWorkspaceTranslation.translateMetadata(workspaceId));
  ipcMain.handle(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.distribute, (_event, workspaceId: string) => manager.appWorkspaceTranslation.distribute(workspaceId));
  ipcMain.handle(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.readChapter, (_event, workspaceId: string, chapterNo: number) => manager.appWorkspaceTranslation.readChapter(workspaceId, chapterNo));
  ipcMain.handle(APP_WORKSPACE_TRANSLATION_IPC_CHANNELS.saveChapter, (_event, workspaceId: string, chapterNo: number, body: string) => manager.appWorkspaceTranslation.saveChapter(workspaceId, chapterNo, body));
}
