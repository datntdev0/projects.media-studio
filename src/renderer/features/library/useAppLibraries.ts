import { useCallback, useEffect, useState } from 'react';
import type {
  AppLibrary,
  CreateAppLibraryInput,
  ListAppLibrariesFilter,
  UpdateAppLibraryInput,
} from '../../../shared/app-library';

export interface AppLibrariesState {
  items: AppLibrary[];
  loading: boolean;
  error: string | undefined;
  filter: ListAppLibrariesFilter;
  setFilter(filter: ListAppLibrariesFilter): void;
  refresh(): void;
  create(input: CreateAppLibraryInput): Promise<AppLibrary>;
  update(id: string, input: UpdateAppLibraryInput): Promise<AppLibrary>;
  remove(id: string): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAppLibraries(): AppLibrariesState {
  const [items, setItems] = useState<AppLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<ListAppLibrariesFilter>({});
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    window.appLibraryApi
      .list(filter)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filter, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const create = useCallback(
    async (input: CreateAppLibraryInput) => {
      const created = await window.appLibraryApi.create(input);
      refresh();
      return created;
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, input: UpdateAppLibraryInput) => {
      const updated = await window.appLibraryApi.update(id, input);
      refresh();
      return updated;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await window.appLibraryApi.remove(id);
      refresh();
    },
    [refresh],
  );

  return { items, loading, error, filter, setFilter, refresh, create, update, remove };
}
