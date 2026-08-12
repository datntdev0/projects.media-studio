import type { CreateLibraryContent, LibraryContent, LibraryContentPage, ListLibraryContentsQuery } from '~/types/library-content'

/** The one place a content path is written. */
const contentsOf = (itemId: string) => `/library/${itemId}/contents`

/**
 * What an item holds, over `useApi()`. Thin on purpose — screens keep their own
 * state and the rules live on the server.
 *
 * The bytes never come through here: they go straight to Cloud Storage through
 * `useContentFiles()`, and only the URL travels over these calls.
 */
export const useLibraryContents = () => {
  const api = useApi()

  return {
    list: (itemId: string, query: ListLibraryContentsQuery) => api<LibraryContentPage>(contentsOf(itemId), { query }),
    get: (itemId: string, contentId: string) => api<LibraryContent>(`${contentsOf(itemId)}/${contentId}`),
    create: (itemId: string, content: CreateLibraryContent) => api<LibraryContent>(contentsOf(itemId), { method: 'POST', body: content }),
    /** A `PUT` of the whole writable representation, so an omitted field is cleared. */
    replace: (itemId: string, contentId: string, content: CreateLibraryContent) => api<LibraryContent>(`${contentsOf(itemId)}/${contentId}`, { method: 'PUT', body: content }),
    /** A `204`, so there is nothing to hand back. */
    remove: async (itemId: string, contentId: string): Promise<void> => {
      await api(`${contentsOf(itemId)}/${contentId}`, { method: 'DELETE' })
    }
  }
}
