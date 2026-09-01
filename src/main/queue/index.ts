import type { Container } from '@/main/container';
import { registerAppWorkspaceRunHandler } from './handlers/app-workspace-run.handler';

export function registerQueueHandlers(container: Container): void {
  registerAppWorkspaceRunHandler(container);
}
