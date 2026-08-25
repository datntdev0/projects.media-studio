import { defineConfig } from 'vite';

// https://vitejs.dev/config
//
// See vite.main.config.ts for why the output filename is pinned explicitly.
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'preload.js',
      },
    },
  },
});
