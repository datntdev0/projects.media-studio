import { ipcMain } from 'electron';
import type { Container } from '@/main/container';
import { APP_WORKSPACE_EXTRACTION_IPC_CHANNELS, type WorldBible } from '@/shared/app-workspace-extraction';
import type { LlmSettings } from '@/shared/llm';

export function registerAppWorkspaceExtractionHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKSPACE_EXTRACTION_IPC_CHANNELS.read, (_event, workspaceId: string) => manager.appWorkspaceExtraction.read(workspaceId));
  ipcMain.handle(APP_WORKSPACE_EXTRACTION_IPC_CHANNELS.save, (_event, workspaceId: string, world: WorldBible) => manager.appWorkspaceExtraction.save(workspaceId, world));
  ipcMain.handle(APP_WORKSPACE_EXTRACTION_IPC_CHANNELS.rebuild, (_event, workspaceId: string) => manager.appWorkspaceExtraction.rebuild(workspaceId));
  ipcMain.handle(APP_WORKSPACE_EXTRACTION_IPC_CHANNELS.setLlm, (_event, workspaceId: string, llm: LlmSettings) => manager.appWorkspaceExtraction.setLlm(workspaceId, llm));
}
