import { useCallback } from 'react';
import type { WorkspaceWorldState, WorldBible } from '@/shared/app-workspace-extraction';
import type { LlmSettings } from '@/shared/llm';
import { useEditableDocument, type EditableDocument } from './useEditableDocument';

export interface WorkspaceWorldEditor extends EditableDocument<WorkspaceWorldState, WorldBible> {
  save(): Promise<void>;
  /** Re-merges every chapter extraction, discarding whatever was edited here. */
  rebuild(): Promise<void>;
  setLlm(llm: LlmSettings): Promise<void>;
}

const worldOf = (state: WorkspaceWorldState): WorldBible | null => state.world;

/** One workspace's `extractions/world.json`, read on mount and written back on save — see `useEditableDocument`. */
export function useWorkspaceWorld(workspaceId: string, live: boolean): WorkspaceWorldEditor {
  const load = useCallback(() => window.appWorkspaceExtractionApi.read(workspaceId), [workspaceId]);
  const document = useEditableDocument(load, worldOf, live);
  const { draft, run } = document;

  const save = useCallback(async () => {
    if (draft) await run(window.appWorkspaceExtractionApi.save(workspaceId, draft));
  }, [draft, run, workspaceId]);

  const rebuild = useCallback(() => run(window.appWorkspaceExtractionApi.rebuild(workspaceId)), [run, workspaceId]);

  const setLlm = useCallback((llm: LlmSettings) => run(window.appWorkspaceExtractionApi.setLlm(workspaceId, llm)), [run, workspaceId]);

  return { ...document, save, rebuild, setLlm };
}
