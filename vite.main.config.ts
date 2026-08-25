import { defineConfig } from 'vite';

// https://vitejs.dev/config
//
// The main and preload builds share a single `.vite/build` output directory,
// and Vite's lib build otherwise names the output chunk after the entry
// file's basename (`index.js` for both `src/main/index.ts` and
// `src/preload/index.ts`), which collide. Pin an explicit name here.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/index.ts',
      fileName: () => 'main.js',
      formats: ['cjs'],
    },
    rollupOptions: {
      // `node:sqlite` is a Node built-in, but it's recent enough that it's
      // missing from this Node's `node:module` builtinModules list, which
      // is what Forge's Vite plugin uses to auto-externalize `node:*`
      // imports — without this, Rollup would try to bundle it as a real
      // package and fail to resolve it.
      external: ['node:sqlite'],
    },
  },
});
