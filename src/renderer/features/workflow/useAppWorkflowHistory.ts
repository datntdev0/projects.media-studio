import { useCallback, useEffect, useState } from 'react';
import type { AppWorkflowRun } from '../../../shared/app-workflow-history';

export interface AppWorkflowHistoryState {
  runs: AppWorkflowRun[];
  loading: boolean;
  error: string | undefined;
  refresh(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAppWorkflowHistory(workflowId: string): AppWorkflowHistoryState {
  const [runs, setRuns] = useState<AppWorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setLoading(true);
    window.appWorkflowHistoryApi
      .listRuns(workflowId)
      .then((list) => {
        setRuns(list);
        setError(undefined);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [workflowId, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return { runs, loading, error, refresh };
}
