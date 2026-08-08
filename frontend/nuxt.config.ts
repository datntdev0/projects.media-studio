// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

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
  // synchronously instead of being fetched from `/api/_nuxt_icon`. Without this
  // every non-Nuxt-UI icon warns `[Icon] failed to load icon` during SSR and
  // only appears after hydration. The scanner's default globs miss `.ts`, where
  // `useNavigation` keeps the sidebar icons, so spell the patterns out.
  icon: {
    clientBundle: {
      scan: {
        globInclude: ['app/**/*.{vue,ts}']
      }
    }
  }
})
