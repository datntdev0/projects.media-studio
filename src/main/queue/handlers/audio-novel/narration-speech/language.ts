import { readWorkspaceManifest } from '@/main/helpers/paths';
import { WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { TRANSLATION_LANGUAGE } from '@/shared/app-workspace-translation';

/** Whether the workspace reads the translation — otherwise the novel is read in its own language. */
export function translates(workspace: AppWorkspace): boolean {
  return workspace.steps.some((step) => step.key === WorkspaceStepKey.SemanticTranslate);
}

/** The language the chapters are read in, which scopes the narration files — `vi` when the workspace translates, the novel's own otherwise. */
export function narrationLanguageOf(workspace: AppWorkspace): string {
  if (translates(workspace)) return TRANSLATION_LANGUAGE;
  return readWorkspaceManifest(workspace.name)?.library.novel?.language ?? TRANSLATION_LANGUAGE;
}
