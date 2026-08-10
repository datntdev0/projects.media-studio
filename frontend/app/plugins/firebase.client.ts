import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'

/**
 * The Firebase app, created once and handed out as `$firebaseAuth`.
 *
 * A plugin rather than part of `useAuth()` because `connectAuthEmulator` has to
 * run before anything else touches the Auth instance — a request that goes out
 * first would go to the real project.
 *
 * The emulator prints its own console banner; that warning is left on, so it is
 * never a question which backend a session came from.
 */
export default defineNuxtPlugin(() => {
  const { firebase } = useRuntimeConfig().public

  const auth = getAuth(initializeApp({
    apiKey: firebase.apiKey,
    authDomain: firebase.authDomain,
    projectId: firebase.projectId,
    appId: firebase.appId
  }))

  if (firebase.emulatorHost) {
    connectAuthEmulator(auth, firebase.emulatorHost)
  }

  return {
    provide: {
      firebaseAuth: auth
    }
  }
})
