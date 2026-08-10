// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Line length is a judgement call, not a lint error.
    'max-len': 'off',
    '@stylistic/max-len': 'off',
    'vue/max-len': 'off',
    'vue/no-multiple-template-root': 'off',
    'vue/max-attributes-per-line': ['error', { singleline: 3 }]
  }
})
