import { AuthClient, LibraryClient, ScrapingClient } from '~/utils/api.clients'

/**
 * The API, through the clients NSwag generates from it.
 *
 * `app/utils/api.clients.ts` is that output — built from the document the backend
 * serves, so a renamed route or a changed DTO turns into a type error here rather
 * than a 404 in front of somebody. Regenerate it with `pnpm generate:api`, and
 * never edit it.
 *
 * This composable is the part a generator cannot know: where the service is, and
 * the token every protected route wants. One client per tag in the document, which
 * is why an item's content is on `libraryClient` — it is a library route.
 */
export const useApiClient = () => {
  const { apiBase } = useRuntimeConfig().public
  const { getIdToken, expireSession } = useAuth()

  // The seam NSwag leaves for exactly this: every generated method goes through
  // `http.fetch`, so one wrapper authenticates all of them. The token is read per
  // request rather than once — `getIdToken()` renews an expired one, which is what
  // keeps a tab left open working.
  const http = {
    async fetch(url: RequestInfo, init?: RequestInit): Promise<Response> {
      const token = await getIdToken()
      const headers = new Headers(init?.headers)

      if (token) {
        headers.set('authorization', `Bearer ${token}`)
      }

      const response = await globalThis.fetch(url, { ...init, headers })

      // A token the API refuses is a session that is over, whatever the page was
      // doing with it. The caller still gets its `ApiException` to render.
      if (response.status === 401) {
        await expireSession()
      }

      return response
    }
  }

  return {
    authClient: new AuthClient(apiBase, http),
    libraryClient: new LibraryClient(apiBase, http),
    scrapingClient: new ScrapingClient(apiBase, http)
  }
}
