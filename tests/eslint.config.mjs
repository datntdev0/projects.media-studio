// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Same call as backend and frontend: no Prettier, formatting is left to the
// editor and .editorconfig.
export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'test-results', 'playwright-report'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-len': 'off',
    },
  },
);
