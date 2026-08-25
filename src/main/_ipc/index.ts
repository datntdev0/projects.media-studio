import type { Container } from '../container';
import { registerAppInfoHandlers } from './app-info.handlers';
import { registerAppLibraryHandlers } from './app-library.handlers';

export function registerIpcHandlers(container: Container): void {
  registerAppInfoHandlers(container);
  registerAppLibraryHandlers(container);
}
