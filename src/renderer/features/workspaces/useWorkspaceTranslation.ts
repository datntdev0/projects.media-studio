import { useCallback } from 'react';
import type { WorkspaceTranslationState, WorldTranslation } from '@/shared/app-workspace-translation';
import type { LlmSettings } from '@/shared/llm';
import { useEditableDocument, type EditableDocument } from './useEditableDocument';

export interface WorkspaceTranslationEditor extends EditableDocument<WorkspaceTranslationState, WorldTranslation> {
  save(): Promise<void>;
  /** Asks the LLM for whatever the world bible has that the translation does not yet. Edits are kept. */
  translateMetadata(): Promise<void>;
  /** Rewrites every extracted chapter's metadata from the translation as saved. */
  distribute(): Promise<void>;
  setLlm(llm: LlmSettings): Promise<void>;
}

const worldOf = (state: WorkspaceTranslationState): WorldTranslation | null => state.world;

/** One workspace's `translations/vi/world.vi.json`, read on mount and written back on save — see `useEditableDocument`. */
export function useWorkspaceTranslation(workspaceId: string, live: boolean): WorkspaceTranslationEditor {
  const load = useCallback(() => window.appWorkspaceTranslationApi.read(workspaceId), [workspaceId]);
  const document = useEditableDocument(load, worldOf, live);
  const { draft, run } = document;

  const save = useCallback(async () => {
    if (draft) await run(window.appWorkspaceTranslationApi.save(workspaceId, draft));
  }, [draft, run, workspaceId]);

  const translateMetadata = useCallback(() => run(window.appWorkspaceTranslationApi.translateMetadata(workspaceId)), [run, workspaceId]);

  const distribute = useCallback(() => run(window.appWorkspaceTranslationApi.distribute(workspaceId)), [run, workspaceId]);

  // The pick is the workspace's, kept by the extraction manager — so it is written there and this screen's state re-read.
  const setLlm = useCallback((llm: LlmSettings) => run(window.appWorkspaceExtractionApi.setLlm(workspaceId, llm).then(load)), [run, load, workspaceId]);

  return { ...document, save, translateMetadata, distribute, setLlm };
}
