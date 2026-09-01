import { useCallback, useEffect, useState } from 'react';
import { type AppLibrary, type CreateAppLibraryInput, type ListAppLibrariesFilter, type UpdateAppLibraryInput } from '../../../shared/app-library';

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
  /** Creates an item from an exported `.zip`, in place of describing one field by field. */
  importPackage(data: ArrayBuffer): Promise<string>;
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

  const load = useCallback(
    (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      return window.appLibraryApi
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

  const importPackage = useCallback(
    async (data: ArrayBuffer) => {
      const id = await window.appLibraryPackageApi.import(data);
      refresh();
      return id;
    },
    [refresh],
  );

  return { items, loading, error, filter, setFilter, refresh, create, update, remove, importPackage };
}
