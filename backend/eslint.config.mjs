// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// No Prettier here, and none in the frontend either: formatting is left to the
// editor and .editorconfig. Line length in particular is a judgement call — a
// long string or a wide signature reads better whole than wrapped.
export default tseslint.config(
  {
    // The parked files are out of the TypeScript project while the library
    // contract is refactored, so the type-checked rules cannot see them.
    // Mirrors the `exclude` list in tsconfig.json.
    ignores: [
      'eslint.config.mjs',
      'src/library/library-content.manager*.ts',
      'src/library/library-content.repository.ts',
      'src/library/library-export.manager*.ts',
      'src/library/library-import.*.ts',
      'src/library/library-translation.*.ts',
      'src/library/library.manager*.ts',
      'src/library/library.repository.ts',
      'src/library/dto/library-package.dto.ts',
      'src/library/entities/library-package.entity.ts',
      'src/scraping/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'max-len': 'off',
    },
  },
  {
    // The controller is a contract skeleton: its handlers declare the parameters
    // Swagger reads and answer 501, so none of them is used yet.
    files: ['src/library/library.controller.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
