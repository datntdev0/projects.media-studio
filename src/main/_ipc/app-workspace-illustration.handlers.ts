import { ipcMain } from 'electron';
import type { Container } from '@/main/container';
import { APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS, type ArtStyle, type ChapterFramePlan, type IllustrationDesign } from '@/shared/app-workspace-illustration';

export function registerAppWorkspaceIllustrationHandlers({ manager }: Container): void {
  ipcMain.handle(APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS.read, (_event, workspaceId: string) => manager.appWorkspaceIllustration.read(workspaceId));
  ipcMain.handle(APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS.setStyle, (_event, workspaceId: string, style: ArtStyle) => manager.appWorkspaceIllustration.setStyle(workspaceId, style));
  ipcMain.handle(APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS.saveDesign, (_event, workspaceId: string, design: IllustrationDesign) => manager.appWorkspaceIllustration.saveDesign(workspaceId, design));
  ipcMain.handle(APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS.rebuildDesign, (_event, workspaceId: string) => manager.appWorkspaceIllustration.rebuildDesign(workspaceId));
  ipcMain.handle(APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS.readChapter, (_event, workspaceId: string, chapterNo: number) => manager.appWorkspaceIllustration.readChapter(workspaceId, chapterNo));
  ipcMain.handle(APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS.saveFrames, (_event, workspaceId: string, chapterNo: number, plan: ChapterFramePlan) => manager.appWorkspaceIllustration.saveFrames(workspaceId, chapterNo, plan));
  ipcMain.handle(APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS.planFrames, (_event, workspaceId: string, chapterNo: number) => manager.appWorkspaceIllustration.planFrames(workspaceId, chapterNo));
  ipcMain.handle(APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS.drawCharacter, (_event, workspaceId: string, characterSlug: string, outfitSlug: string) => manager.appWorkspaceIllustration.drawCharacter(workspaceId, characterSlug, outfitSlug));
  ipcMain.handle(APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS.drawFrame, (_event, workspaceId: string, chapterNo: number, frameIdx: number) => manager.appWorkspaceIllustration.drawFrame(workspaceId, chapterNo, frameIdx));
}
