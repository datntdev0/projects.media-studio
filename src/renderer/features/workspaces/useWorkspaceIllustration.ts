import { useCallback } from 'react';
import type { ArtStyle, IllustrationDesign, WorkspaceIllustrationState } from '@/shared/app-workspace-illustration';
import { useEditableDocument } from './useEditableDocument';

export interface WorkspaceIllustrationEditor {
  /** What is on disk, or undefined until the first read lands. */
  state: WorkspaceIllustrationState | undefined;
  /** The design being edited — null while there is none on disk yet. */
  draft: IllustrationDesign | null;
  loading: boolean;
  busy: boolean;
  error: string | undefined;
  dirty: boolean;
  edit(design: IllustrationDesign): void;
  revert(): void;
  save(): Promise<void>;
  rebuild(): Promise<void>;
  setStyle(style: ArtStyle): Promise<void>;
  /** Draws one character image — the base look when `outfitSlug` is `BASE_LOOK_SLUG`. */
  drawCharacter(characterSlug: string, outfitSlug: string): Promise<void>;
  /** Re-reads the step's state, after something outside this document changed it. */
  reload(): Promise<void>;
}

const designOf = (state: WorkspaceIllustrationState): IllustrationDesign | null => state.design;

/** One workspace's character design, re-read while a run draws into it — see `useEditableDocument` for the polling. */
export function useWorkspaceIllustration(workspaceId: string, live: boolean): WorkspaceIllustrationEditor {
  const load = useCallback(() => window.appWorkspaceIllustrationApi.read(workspaceId), [workspaceId]);
  const { state, draft, loading, busy, error, dirty, edit, revert, run } = useEditableDocument(load, designOf, live);

  const save = useCallback(async () => {
    if (draft) await run(window.appWorkspaceIllustrationApi.saveDesign(workspaceId, draft));
  }, [run, workspaceId, draft]);

  const rebuild = useCallback(() => run(window.appWorkspaceIllustrationApi.rebuildDesign(workspaceId)), [run, workspaceId]);
  const setStyle = useCallback((style: ArtStyle) => run(window.appWorkspaceIllustrationApi.setStyle(workspaceId, style)), [run, workspaceId]);
  const drawCharacter = useCallback((characterSlug: string, outfitSlug: string) => run(window.appWorkspaceIllustrationApi.drawCharacter(workspaceId, characterSlug, outfitSlug)), [run, workspaceId]);
  const reload = useCallback(() => run(load()), [run, load]);

  return { state, draft, loading, busy, error, dirty, edit, revert, save, rebuild, setStyle, drawCharacter, reload };
}
