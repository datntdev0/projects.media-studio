import type { Container } from '../container';
import { registerAppInfoHandlers } from './app-info.handlers';

export function registerIpcHandlers(container: Container): void {
  registerAppInfoHandlers(container);
}
