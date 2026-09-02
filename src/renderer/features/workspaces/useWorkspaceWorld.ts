import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceWorldState, WorldBible } from '@/shared/app-workspace-extraction';
import type { LlmSettings } from '@/shared/llm';

/** How often the world bible is re-read while a run is extracting into it — same cadence as the run log. */
const POLL_MS = 2_000;

export interface WorkspaceWorldEditor {
  /** What is on disk, or undefined until the first read lands. */
  state: WorkspaceWorldState | undefined;
  /** The bible being edited — null when no chapter has been analysed yet. */
  draft: WorldBible | null;
  loading: boolean;
  busy: boolean;
  error: string | undefined;
  dirty: boolean;
  edit(world: WorldBible): void;
  revert(): void;
  save(): Promise<void>;
  /** Re-merges every chapter extraction, discarding whatever was edited here. */
  rebuild(): Promise<void>;
  setLlm(llm: LlmSettings): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One workspace's `extractions/world.json`, read on mount and written back on
 * save. With `live` set — a run is extracting into it — it is re-read on a timer,
 * since the step's handler works in the main process and sends nothing back. A
 * poll never throws away an edit in progress: it refreshes the chapter list and
 * the stamp, and only takes the new bible when nothing is unsaved.
 */
export function useWorkspaceWorld(workspaceId: string, live: boolean): WorkspaceWorldEditor {
  const [state, setState] = useState<WorkspaceWorldState | undefined>(undefined);
  const [draft, setDraft] = useState<WorldBible | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  // Read inside the poll, which would otherwise close over a stale `dirty`.
  const dirtyRef = useRef(false);

  const apply = useCallback((next: WorkspaceWorldState, force: boolean) => {
    setState(next);
    if (force || !dirtyRef.current) {
      setDraft(next.world);
      dirtyRef.current = false;
      setDirty(false);
    }
    setError(undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    window.appWorkspaceExtractionApi
      .read(workspaceId)
      .then((next) => apply(next, true))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [workspaceId, apply]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      // A read that fails mid-run is not worth reporting — the next tick tries again.
      window.appWorkspaceExtractionApi.read(workspaceId).then((next) => apply(next, false)).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [live, workspaceId, apply]);

  const edit = useCallback((world: WorldBible) => {
    setDraft(world);
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  const revert = useCallback(() => {
    setDraft(state?.world ?? null);
    dirtyRef.current = false;
    setDirty(false);
  }, [state]);

  const run = useCallback(
    async (work: Promise<WorkspaceWorldState>) => {
      setBusy(true);
      try {
        apply(await work, true);
      } catch (err: unknown) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  const save = useCallback(async () => {
    if (draft) await run(window.appWorkspaceExtractionApi.save(workspaceId, draft));
  }, [draft, run, workspaceId]);

  const rebuild = useCallback(() => run(window.appWorkspaceExtractionApi.rebuild(workspaceId)), [run, workspaceId]);

  const setLlm = useCallback((llm: LlmSettings) => run(window.appWorkspaceExtractionApi.setLlm(workspaceId, llm)), [run, workspaceId]);

  return { state, draft, loading, busy, error, dirty, edit, revert, save, rebuild, setLlm };
}
