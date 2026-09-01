import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
//
// The renderer's HTML entry and source live under src/renderer (not the
// project root), so point Vite's root there. That also makes the plugin's
// default (relative) `build.outDir` resolve *inside* src/renderer instead of
// at the project root, where src/main's `loadFile` expects it — so the
// override below walks back up to the project root explicitly.
export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: '../../.vite/renderer/main_window',
    // outDir now resolves outside `root`; Vite won't auto-empty it otherwise.
    emptyOutDir: true,
  },
  // Path aliases, kept in step with `paths` in tsconfig.web.json. Resolved from
  // the project root, not Vite's `root` above.
  resolve: {
    alias: {
      '@/components': path.resolve(__dirname, 'src/renderer/components'),
      '@/features': path.resolve(__dirname, 'src/renderer/features'),
      '@/styles': path.resolve(__dirname, 'src/renderer/styles'),
      '@/shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  plugins: [react()],
});
