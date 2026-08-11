import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

/**
 * The Firebase app, created once and handed out as `$firebaseAuth` and
 * `$firebaseStorage`.
 *
 * A plugin rather than part of `useAuth()` because `connectAuthEmulator` has to
 * run before anything else touches the Auth instance — a request that goes out
 * first would go to the real project. Storage is the same: it is connected here
 * so no upload can start before the emulator is pointed at.
 *
 * The emulator prints its own console banner; that warning is left on, so it is
 * never a question which backend a session came from.
 */
export default defineNuxtPlugin(() => {
  const { firebase } = useRuntimeConfig().public

  const app = initializeApp({
    apiKey: firebase.apiKey,
    authDomain: firebase.authDomain,
    projectId: firebase.projectId,
    appId: firebase.appId,
    storageBucket: firebase.storageBucket
  })

  const auth = getAuth(app)
  const storage = getStorage(app)

  if (firebase.emulatorAuthenticationHost) {
    connectAuthEmulator(auth, firebase.emulatorAuthenticationHost)
  }

  if (firebase.emulatorStorageHost) {
    const { hostname, port } = new URL(firebase.emulatorStorageHost)

    connectStorageEmulator(storage, hostname, Number(port))
  }

  return {
    provide: {
      firebaseAuth: auth,
      firebaseStorage: storage
    }
  }
})
