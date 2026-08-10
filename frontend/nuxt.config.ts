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
      /** The backend, version prefix included. */
      apiBase: 'http://localhost:3001/api/v1',

      firebase: {
        apiKey: '',
        authDomain: '',
        projectId: '',
        appId: '',
        /** Set to run against the Auth emulator; empty talks to Firebase itself. */
        emulatorHost: ''
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
