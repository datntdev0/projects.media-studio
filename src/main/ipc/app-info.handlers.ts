import { ipcMain } from 'electron';
import { APP_INFO_IPC_CHANNELS } from '../../shared/app-info';
import type { Container } from '../container';

export function registerAppInfoHandlers({ manager }: Container): void {
  ipcMain.handle(APP_INFO_IPC_CHANNELS.get, () => manager.appInfo.get() ?? null);
}
