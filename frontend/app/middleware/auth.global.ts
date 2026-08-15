/**
 * Every route needs a session except the sign-in screen. `ready` is awaited rather
 * than reading `user` straight away: with `ssr: false` the SDK restores the session
 * after boot, so a refresh would otherwise look signed-out and bounce.
 *
 * A restored session is only half the answer — `/auth/me` is the other half, and it
 * signs out what the API refuses, so `user` is null again by the time it is read.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { ready, user, verifySession } = useAuth()

  await ready

  if (user.value) {
    await verifySession()
  }

  if (!user.value) {
    return to.path === LOGIN_ROUTE ? undefined : navigateTo({ path: LOGIN_ROUTE, query: { redirect: to.fullPath } })
  }

  if (to.path === LOGIN_ROUTE) {
    return navigateTo('/')
  }
})
