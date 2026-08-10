# @media-studio/frontend

The Media Studio web app — a [Nuxt 4](https://nuxt.com) dashboard built with [Nuxt UI](https://ui.nuxt.com) for building, running and monitoring media pipelines.

Part of the [projects.media-studio](../README.md) monorepo. Install from the repository root, not from here.

## Development

```bash
pnpm dev:frontend   # from the repository root
pnpm dev            # or from this directory
```

Runs on `http://localhost:3000`. The API is expected on `http://localhost:3001`.

## Rendering

**Client-side only** — `ssr: false` in `nuxt.config.ts`. The studio is an authenticated console behind a login, so there is nothing to server-render and no SEO to serve. `pnpm build` emits a static shell in `.output/public` that boots into the app.

## Structure

```
app/
  app.vue          root: <UApp>, layout and page outlets, head defaults
  app.config.ts    Nuxt UI theming — which palette fills which role
  error.vue        the error screen
  layouts/         default (dashboard shell), auth (split sign-in frame)
  pages/           one file per route
  components/      App*-prefixed, auto-imported
  composables/     useNavigation — sidebar links and g-* shortcuts
  assets/css/      the design system's tokens and element defaults
```

## Design system

The app is skinned with **Industry**, documented in [DESIGN.md](../DESIGN.md) at the repository root. Read it before styling anything: components take colours, spacing and type from tokens, and literal values do not belong in application code.

| File in `app/assets/css/` | Holds |
| --- | --- |
| `main.css` | Entry point, plus the primitives (`@theme`) — ramps, type scale, density scale |
| `tokens.css` | Semantic roles, and the bridge that hands them to the Nuxt UI `--ui-*` tokens |
| `base.css` | Element defaults — heading face, links, focus, selection, scrollbars |
| `blueprint.css` | The `.blueprint` frame and `.duotone` image wrapper |
| `lockup.css` | The brand lockup |
| `auth.css` | The sign-in screen and its deep side panel |

Source mockups live in `_docs/design/` at the repository root — local only, not committed.

## Commands

```bash
pnpm build      # production build
pnpm preview    # preview the production build locally
pnpm lint       # lint (lint:fix to autofix)
pnpm typecheck  # type-check with vue-tsc
```

## License

[MIT](../LICENSE) © Dat Nguyen
