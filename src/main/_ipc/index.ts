import type { Container } from '@/main/container';
import { registerAppInfoHandlers } from './app-info.handlers';
import { registerAppLibraryHandlers } from './app-library.handlers';
import { registerAppLibraryPackageHandlers } from './app-library-package.handlers';
import { registerAppLibraryContentHandlers } from './app-library-content.handlers';
import { registerAppWorkspaceHandlers } from './app-workspace.handlers';
import { registerAppWorkspaceRunHandlers } from './app-workspace-run.handlers';
import { registerAppWorkspaceExtractionHandlers } from './app-workspace-extraction.handlers';
import { registerAppWorkspaceTranslationHandlers } from './app-workspace-translation.handlers';

export function registerIpcHandlers(container: Container): void {
  registerAppInfoHandlers(container);
  registerAppLibraryHandlers(container);
  registerAppLibraryPackageHandlers(container);
  registerAppLibraryContentHandlers(container);
  registerAppWorkspaceHandlers(container);
  registerAppWorkspaceRunHandlers(container);
  registerAppWorkspaceExtractionHandlers(container);
  registerAppWorkspaceTranslationHandlers(container);
}
