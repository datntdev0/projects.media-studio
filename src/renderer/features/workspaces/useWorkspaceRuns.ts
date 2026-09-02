import { useCallback, useEffect, useState } from 'react';
import { isRunActive, type AppWorkspaceRun, type SubmitWorkspaceRunInput } from '@/shared/app-workspace-run';

/** How often a run in flight is re-read — the orchestrator works in the main process, which sends nothing back. */
const POLL_MS = 2_000;

export interface WorkspaceRunsState {
  runs: AppWorkspaceRun[];
  loading: boolean;
  error: string | undefined;
  refresh(): void;
  submit(input: SubmitWorkspaceRunInput): Promise<AppWorkspaceRun>;
  cancel(id: string): Promise<AppWorkspaceRun>;
  clear(): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One workspace's run history. `onChange` lets the screen behind it reload the workspace a run just moved. */
export function useWorkspaceRuns(workspaceId: string, onChange?: () => void): WorkspaceRunsState {
  const [runs, setRuns] = useState<AppWorkspaceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(
    (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      return window.appWorkspaceRunApi
        .list(workspaceId)
        .then((list) => {
          setRuns(list);
          setError(undefined);
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => {
          if (showLoading) setLoading(false);
        });
    },
    [workspaceId],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  // A run advances in the main process, so a run in flight is followed by re-reading it.
  const inFlight = runs.some(isRunActive);
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => {
      load(false);
      onChange?.();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [inFlight, load, onChange]);

  const submit = useCallback(
    async (input: SubmitWorkspaceRunInput) => {
      const run = await window.appWorkspaceRunApi.submit(input);
      await load(false);
      onChange?.();
      return run;
    },
    [load, onChange],
  );

  const cancel = useCallback(
    async (id: string) => {
      const run = await window.appWorkspaceRunApi.cancel(id);
      await load(false);
      onChange?.();
      return run;
    },
    [load, onChange],
  );

  const clear = useCallback(
    async () => {
      await window.appWorkspaceRunApi.clear(workspaceId);
      await load(false);
      onChange?.();
    },
    [workspaceId, load, onChange],
  );

  return { runs, loading, error, refresh, submit, cancel, clear };
}
