import { useCallback, useEffect, useState } from 'react';
import { AppWorkflowStatus, type AppWorkflow, type CreateAppWorkflowInput, type ListAppWorkflowsFilter, type UpdateAppWorkflowInput } from '../../../shared/app-workflow';

const POLL_MS = 2000;

export interface AppWorkflowsState {
  items: AppWorkflow[];
  loading: boolean;
  error: string | undefined;
  filter: ListAppWorkflowsFilter;
  setFilter(filter: ListAppWorkflowsFilter): void;
  refresh(): void;
  create(input: CreateAppWorkflowInput): Promise<AppWorkflow>;
  update(id: string, input: UpdateAppWorkflowInput): Promise<AppWorkflow>;
  remove(id: string): Promise<void>;
  run(id: string): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAppWorkflows(): AppWorkflowsState {
  const [items, setItems] = useState<AppWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<ListAppWorkflowsFilter>({});
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(
    (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      return window.appWorkflowApi
        .list(filter)
        .then((list) => {
          setItems(list);
          setError(undefined);
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => {
          if (showLoading) setLoading(false);
        });
    },
    [filter],
  );

  useEffect(() => {
    load(true);
  }, [load, reloadToken]);

  useEffect(() => {
    if (!items.some((item) => item.status === AppWorkflowStatus.Running)) return;
    const timer = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(timer);
  }, [items, load]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const create = useCallback(
    async (input: CreateAppWorkflowInput) => {
      const created = await window.appWorkflowApi.create(input);
      refresh();
      return created;
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, input: UpdateAppWorkflowInput) => {
      const updated = await window.appWorkflowApi.update(id, input);
      refresh();
      return updated;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await window.appWorkflowApi.remove(id);
      refresh();
    },
    [refresh],
  );

  const run = useCallback(
    async (id: string) => {
      await window.appWorkflowApi.execute(id);
      refresh();
    },
    [refresh],
  );

  return { items, loading, error, filter, setFilter, refresh, create, update, remove, run };
}
