import path from 'node:path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
//
// See vite.main.config.ts for why the output filename is pinned explicitly.
export default defineConfig({
  // Path aliases, kept in step with `paths` in tsconfig.node.json.
  resolve: {
    alias: {
      '@/main': path.resolve(__dirname, 'src/main'),
      '@/preload': path.resolve(__dirname, 'src/preload'),
      '@/shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'preload.js',
      },
    },
  },
});
