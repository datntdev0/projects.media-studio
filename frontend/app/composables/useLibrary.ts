import type { CreateLibraryItem, LibraryItem, LibraryItemPage, ListLibraryItemsQuery, ReplaceLibraryItem } from '~/types/library'

/** The one place a library path is written. */
const LIBRARY = '/library'

/**
 * The library endpoints, over `useApi()`.
 *
 * Thin on purpose: it turns four calls into four named methods and adds nothing
 * else. The screen keeps its own state — what a filter is, when to refetch — and
 * the rules live on the server, where a second client would meet them too.
 *
 * `replace` is a `PUT` of the whole writable representation, so a field left out
 * of `item` is cleared rather than kept.
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
