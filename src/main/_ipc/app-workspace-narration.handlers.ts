import { ipcMain } from 'electron';
import type { Container } from '@/main/container';
import { APP_WORKSPACE_NARRATION_IPC_CHANNELS, type SpeechSettings } from '@/shared/app-workspace-narration';

export function registerAppWorkspaceNarrationHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKSPACE_NARRATION_IPC_CHANNELS.read, (_event, workspaceId: string) => manager.appWorkspaceNarration.read(workspaceId));
  ipcMain.handle(APP_WORKSPACE_NARRATION_IPC_CHANNELS.setSpeech, (_event, workspaceId: string, speech: SpeechSettings) => manager.appWorkspaceNarration.setSpeech(workspaceId, speech));
  ipcMain.handle(APP_WORKSPACE_NARRATION_IPC_CHANNELS.readChapter, (_event, workspaceId: string, chapterNo: number) => manager.appWorkspaceNarration.readChapter(workspaceId, chapterNo));
}
