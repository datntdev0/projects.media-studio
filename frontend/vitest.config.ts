import { defineVitestConfig } from '@nuxt/test-utils/config'

/**
 * The Nuxt environment, so a page mounts with its auto-imports, its components and
 * its layout resolved the way the app resolves them.
 *
 * Pointed at the committed example config rather than at `.env`, which on a
 * developer's machine names the real Firebase project.
 */
export default defineVitestConfig({
  test: {
    include: ['tests/nuxt/**/*.spec.ts'],
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        dotenv: { fileName: '.env.example' }
      }
    },
    coverage: {
      include: ['app/**/*.{ts,vue}'],
      exclude: ['app/utils/api.clients.ts'],
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'html', 'json-summary']
    }
  }
})
