import { useCallback } from 'react';
import type { SpeechSettings, WorkspaceNarrationState } from '@/shared/app-workspace-narration';
import { useEditableDocument } from './useEditableDocument';

export interface WorkspaceNarrationEditor {
  /** What is on disk, or undefined until the first read lands. */
  state: WorkspaceNarrationState | undefined;
  loading: boolean;
  busy: boolean;
  error: string | undefined;
  setSpeech(speech: SpeechSettings): Promise<void>;
}

/** The step has no document to edit — the screen only reads its files and sets the voice. */
const noDocument = (): null => null;

/** One workspace's narration progress, re-read while a run writes audio — see `useEditableDocument` for the polling. */
export function useWorkspaceNarration(workspaceId: string, live: boolean): WorkspaceNarrationEditor {
  const load = useCallback(() => window.appWorkspaceNarrationApi.read(workspaceId), [workspaceId]);
  const { state, loading, busy, error, run } = useEditableDocument(load, noDocument, live);

  const setSpeech = useCallback((speech: SpeechSettings) => run(window.appWorkspaceNarrationApi.setSpeech(workspaceId, speech)), [run, workspaceId]);

  return { state, loading, busy, error, setSpeech };
}
