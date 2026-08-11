import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

/**
 * The Firebase app, created once as `$firebaseAuth` and `$firebaseStorage`.
 *
 * A plugin rather than part of `useAuth()` because the emulators must be
 * connected before anything touches Auth or Storage — a request that goes out
 * first would hit the real project.
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
