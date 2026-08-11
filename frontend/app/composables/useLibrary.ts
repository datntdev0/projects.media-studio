import type { CreateLibraryItem, LibraryItem, LibraryItemPage, ListLibraryItemsQuery, ReplaceLibraryItem } from '~/types/library'

/** The one place a library path is written. */
const LIBRARY = '/library'

/**
 * The library endpoints over `useApi()`. Thin on purpose — screens keep their own
 * state and the rules live on the server.
 *
 * `replace` PUTs the whole writable representation, so an omitted field is cleared.
 */
export const useLibrary = () => {
  const api = useApi()

  return {
    list: (query: ListLibraryItemsQuery) => api<LibraryItemPage>(LIBRARY, { query }),
    create: (item: CreateLibraryItem) => api<LibraryItem>(LIBRARY, { method: 'POST', body: item }),
    replace: (id: string, item: ReplaceLibraryItem) => api<LibraryItem>(`${LIBRARY}/${id}`, { method: 'PUT', body: item }),
    /** A `204`, so there is nothing to hand back. */
    remove: async (id: string): Promise<void> => {
      await api(`${LIBRARY}/${id}`, { method: 'DELETE' })
    }
  }
}
