import type { Container } from '../container';
import { registerAppInfoHandlers } from './app-info.handlers';
import { registerAppLibraryHandlers } from './app-library.handlers';
import { registerAppLibraryPackageHandlers } from './app-library-package.handlers';
import { registerAppLibraryContentHandlers } from './app-library-content.handlers';

export function registerIpcHandlers(container: Container): void {
  registerAppInfoHandlers(container);
  registerAppLibraryHandlers(container);
  registerAppLibraryPackageHandlers(container);
  registerAppLibraryContentHandlers(container);
}
