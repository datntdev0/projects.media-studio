import { useCallback, useEffect, useState } from 'react';
import type { AppWorkspace, CreateAppWorkspaceInput, ListAppWorkspacesFilter, UpdateAppWorkspaceInput } from '@/shared/app-workspace';

export interface AppWorkspacesState {
  items: AppWorkspace[];
  loading: boolean;
  error: string | undefined;
  totalCount: number;
  filter: ListAppWorkspacesFilter;
  setFilter(filter: ListAppWorkspacesFilter): void;
  refresh(): void;
  create(input: CreateAppWorkspaceInput): Promise<AppWorkspace>;
  update(id: string, input: UpdateAppWorkspaceInput): Promise<AppWorkspace>;
  remove(id: string): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAppWorkspaces(): AppWorkspacesState {
  const [items, setItems] = useState<AppWorkspace[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<ListAppWorkspacesFilter>({});
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(
    (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      // The unfiltered count comes back alongside the page, so an empty listing can
      // say whether the filters hid everything or there is nothing to hide.
      return Promise.all([window.appWorkspaceApi.list(filter), window.appWorkspaceApi.list()])
        .then(([list, all]) => {
          setItems(list);
          setTotalCount(all.length);
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

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const create = useCallback(
    async (input: CreateAppWorkspaceInput) => {
      const created = await window.appWorkspaceApi.create(input);
      refresh();
      return created;
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, input: UpdateAppWorkspaceInput) => {
      const updated = await window.appWorkspaceApi.update(id, input);
      refresh();
      return updated;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await window.appWorkspaceApi.remove(id);
      refresh();
    },
    [refresh],
  );

  return { items, totalCount, loading, error, filter, setFilter, refresh, create, update, remove };
}
