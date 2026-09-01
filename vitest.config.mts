import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests cover main-process/shared logic for now (renderer/preload need a
// browser-like environment and aren't tested yet), run under Node like the
// code they exercise.
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Path aliases, kept in step with `paths` in tsconfig.node.json.
  resolve: {
    alias: {
      '@/main': path.resolve(root, 'src/main'),
      '@/preload': path.resolve(root, 'src/preload'),
      '@/shared': path.resolve(root, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['src/main/**/*.test.ts', 'src/main/database/migrations/**', 'src/main/database/test-db.ts', 'src/main/index.ts'],
    },
  },
});
