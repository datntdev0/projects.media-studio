import { createSharedComposable } from '@vueuse/core'
import { browserLocalPersistence, browserSessionPersistence, onIdTokenChanged, setPersistence, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from 'firebase/auth'

/** The one screen reachable without a session. */
export const LOGIN_ROUTE = '/auth/login'

const _useAuth = () => {
  const { $firebaseAuth: auth } = useNuxtApp()
  const router = useRouter()

  const user = ref<User | null>(null)

  /* Which account the API has already vouched for. The SDK hands out tokens for an
     account the backend may have stopped accepting, so a restored session is worth
     one `/auth/me` — and only one. */
  let verifiedUid: string | null = null

  /* The SDK restores a session from storage after boot, so `currentUser` is null
     for the first few ticks. Anything that branches on "is anybody signed in"
     awaits this instead of reading `user` straight away. */
  let settle = () => {}
  const ready = new Promise<void>((resolve) => {
    settle = resolve
  })

  // Fires on sign-in, sign-out and every token refresh.
  onIdTokenChanged(auth, (next) => {
    user.value = next
    settle()
  })

  /** Falls back through the account's fields rather than showing nothing. */
  const name = computed(() => user.value?.displayName || user.value?.email || 'Signed in')

  const initials = computed(() => name.value
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join(''))

  /** `keepSignedIn` is the difference between surviving a browser restart and not. */
  async function signIn(email: string, password: string, keepSignedIn: boolean): Promise<void> {
    await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence)
    await signInWithEmailAndPassword(auth, email, password)
  }

  /** Re-signs in the current account, keeping its persistence. Used after a password change, which does not renew the session. */
  async function reauthenticate(password: string): Promise<void> {
    const email = user.value?.email

    if (!email) {
      throw new Error('No signed-in account to re-authenticate')
    }

    await signInWithEmailAndPassword(auth, email, password)
  }

  function signOut(): Promise<void> {
    verifiedUid = null

    return firebaseSignOut(auth)
  }

  /** Whether the API accepts the signed-in account. One it refuses is signed out, which leaves `user` null for whoever asked. */
  async function verifySession(): Promise<boolean> {
    const uid = user.value?.uid

    if (!uid) {
      return false
    }

    if (uid === verifiedUid) {
      return true
    }

    try {
      await useApiClient().authClient.me()
      verifiedUid = uid

      return true
    } catch {
      await signOut()

      return false
    }
  }

  /** Ends a session the API has refused mid-page, where no route change was on its way to notice. */
  async function expireSession(): Promise<void> {
    const { path, fullPath } = router.currentRoute.value

    await signOut()

    if (path !== LOGIN_ROUTE) {
      await navigateTo({ path: LOGIN_ROUTE, query: { redirect: fullPath } })
    }
  }

  /** A usable ID token — the SDK refreshes it when the current one has expired. */
  function getIdToken(): Promise<string | null> {
    return auth.currentUser?.getIdToken() ?? Promise.resolve(null)
  }

  return {
    user,
    name,
    initials,
    ready,
    signIn,
    reauthenticate,
    signOut,
    verifySession,
    expireSession,
    getIdToken
  }
}

/** Shared, so one `onIdTokenChanged` subscription serves every caller off the same `user` ref. */
export const useAuth = createSharedComposable(_useAuth)
