/**
 * `$fetch` against our API, carrying the signed-in user's ID token.
 *
 * The one place the base URL and the bearer header are written, so a screen asks
 * for a path and nothing else. The token is read per request rather than once:
 * `getIdToken()` hands back a refreshed one when the current has expired, which
 * is what keeps a long-lived tab working.
 */
export const useApi = () => {
  const { apiBase } = useRuntimeConfig().public
  const { getIdToken } = useAuth()

  return $fetch.create({
    baseURL: apiBase,

    async onRequest({ options }) {
      const token = await getIdToken()

      if (token) {
        options.headers.set('authorization', `Bearer ${token}`)
      }
    }
  })
}
