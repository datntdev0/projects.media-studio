import { createSharedComposable } from '@vueuse/core'
import { browserLocalPersistence, browserSessionPersistence, onIdTokenChanged, setPersistence, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from 'firebase/auth'

/** The one screen reachable without a session. */
export const LOGIN_ROUTE = '/auth/login'

const _useAuth = () => {
  const { $firebaseAuth: auth } = useNuxtApp()

  const user = ref<User | null>(null)

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
    return firebaseSignOut(auth)
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
    getIdToken
  }
}

/** Shared, so one `onIdTokenChanged` subscription serves every caller off the same `user` ref. */
export const useAuth = createSharedComposable(_useAuth)
