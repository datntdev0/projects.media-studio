/**
 * `$fetch` against our API, carrying the user's ID token. The token is read per
 * request, not once — `getIdToken()` refreshes an expired one, which is what keeps
 * a long-lived tab working.
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
