/**
 * Every route needs a session except the sign-in screen. `ready` is awaited rather
 * than reading `user` straight away: with `ssr: false` the SDK restores the session
 * after boot, so a refresh would otherwise look signed-out and bounce.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { ready, user } = useAuth()

  await ready

  if (!user.value) {
    return to.path === LOGIN_ROUTE ? undefined : navigateTo({ path: LOGIN_ROUTE, query: { redirect: to.fullPath } })
  }

  if (to.path === LOGIN_ROUTE) {
    return navigateTo('/')
  }
})
