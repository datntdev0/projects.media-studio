// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  // Client-side rendering only. The studio is an authenticated console behind a
  // login, so there is nothing to server-render for and no SEO to serve; the
  // build ships a static shell that boots into the app.
  ssr: false,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // All public, because the browser is what talks to Firebase: a web app's
  // Firebase config is not a secret, access is governed by the project's rules
  // rather than by hiding these values. Overridden per environment through the
  // matching NUXT_PUBLIC_* variables — see .env.example.
  runtimeConfig: {
    public: {
      /** The backend's origin. The `/api/v1` prefix belongs to the paths, which the generated client already carries. */
      apiBase: 'http://localhost:3001',

      firebase: {
        projectId: '',
        appId: '',
        apiKey: '',
        authDomain: '', // The domain of the Firebase Authentication instance, e.g. `my-project.firebaseapp.com`.
        storageBucket: '', // The bucket name is the same as the project ID, but with `.appspot.com` appended.
        databaseUrl: '', // The Realtime Database holding live scraping status. Its subdomain is the namespace, and the backend must name the same one.
        emulatorAuthenticationHost: '', // The host of the Firebase Authentication emulator, if used. See https://firebase.google.com/docs/emulator-suite/connect_auth.
        emulatorStorageHost: '', // The host of the Firebase Storage emulator, if used. See https://firebase.google.com/docs/emulator-suite/connect_storage.
        emulatorDatabaseHost: '' // The host of the Realtime Database emulator, if used. See https://firebase.google.com/docs/emulator-suite/connect_rtdb.
      }
    }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Barlow Condensed over Barlow — the system's heading/body pairing, served
  // locally by @nuxt/fonts (bundled with Nuxt UI).
  fonts: {
    families: [
      { name: 'Barlow', provider: 'google', weights: [400, 500, 700] },
      { name: 'Barlow Condensed', provider: 'google', weights: [400, 600] }
    ]
  },

  // Ship the icons we actually use in the client bundle, so they resolve
  // synchronously instead of being fetched from `/api/_nuxt_icon` on first
  // paint. The scanner's default globs miss `.ts`, where `useNavigation` keeps
  // the sidebar icons, so spell the patterns out.
  icon: {
    clientBundle: {
      scan: {
        globInclude: ['app/**/*.{vue,ts}']
      }
    }
  }
})
