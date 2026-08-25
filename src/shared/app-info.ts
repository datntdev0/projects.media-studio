// Types and IPC contract shared between the main process, the preload
// bridge, and the renderer. Keeping this here (rather than duplicating
// shapes on both sides of the bridge) is what makes the contextBridge API
// type-safe end to end.

export interface AppInfo {
  appName: string;
  appVersion: string;
  installId: string;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertAppInfoInput {
  appName: string;
  appVersion: string;
  installId: string;
}

export const APP_INFO_IPC_CHANNELS = {
  get: 'app-info:get',
} as const;

export interface AppInfoApi {
  get(): Promise<AppInfo | null>;
}
