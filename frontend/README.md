# @media-studio/frontend

The Media Studio web app — a [Nuxt 4](https://nuxt.com) dashboard built with [Nuxt UI](https://ui.nuxt.com) for building, running, and monitoring media pipelines.

Part of the [projects.media-studio](../README.md) monorepo. Install dependencies from the repository root, not from this directory.

## Development

```bash
# from the repository root
pnpm dev:frontend

# or from this directory
pnpm dev
```

The dev server runs on `http://localhost:3000`.

## Commands

```bash
pnpm build        # production build
pnpm preview      # preview the production build locally
pnpm lint         # lint (use lint:fix to autofix)
pnpm typecheck    # type-check with vue-tsc
```

## Design system

The app is skinned with **Industry**, documented in [DESIGN.md](../DESIGN.md) at the repository root and sourced from `_design/`. Its tokens live in `app/assets/css/`:

| File | Holds |
| --- | --- |
| `main.css` | Entry point, plus the primitives (`@theme`) — ramps, type scale, density scale |
| `tokens.css` | Semantic roles, and the bridge that hands them to the Nuxt UI `--ui-*` tokens |
| `base.css` | Element defaults — heading face, links, focus, selection, scrollbars |
| `blueprint.css` | The `.blueprint` frame and `.duotone` image wrapper |

Read DESIGN.md before styling anything. Components take colours, spacing and type from tokens; literal values do not belong in application code.

## License

[MIT](../LICENSE) © Dat Nguyen
