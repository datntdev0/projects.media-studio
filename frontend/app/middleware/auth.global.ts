/**
 * The studio is behind a session: every route needs one except the sign-in
 * screen, which needs the opposite.
 *
 * `ready` is awaited rather than reading `user` straight away — with `ssr: false`
 * the SDK restores the session asynchronously after boot, so a page refresh
 * would otherwise look like a signed-out visit and bounce to the login screen.
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
