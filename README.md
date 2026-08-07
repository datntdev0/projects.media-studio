# projects.media-studio

An automated toolbox for generating rich media content across text, images, audio, and video. Designed to streamline creative workflows with modular components and fully customizable pipelines.

## Repository layout

This is a pnpm workspace monorepo.

| Package | Path | Stack |
| --- | --- | --- |
| `@media-studio/backend` | [`backend/`](./backend) | NestJS 11 API (default port `3001`) |
| `@media-studio/frontend` | [`frontend/`](./frontend) | Nuxt 4 + Nuxt UI dashboard (default port `3000`) |

## Prerequisites

- Node.js `>=22`
- pnpm `11.18.0` (pinned via the `packageManager` field — run `corepack enable` to have it picked up automatically)

## Getting started

```bash
pnpm install
```

Installing from the repository root wires up both packages against a single lockfile.

## Common commands

Run from the repository root; each command fans out across every workspace package.

```bash
pnpm dev          # start backend and frontend together
pnpm build        # build every package
pnpm lint         # lint every package
pnpm typecheck    # typecheck every package
pnpm test         # run every package's tests
```

To work on a single package:

```bash
pnpm dev:backend
pnpm dev:frontend

# or target it directly
pnpm --filter @media-studio/backend run test
```

## License

[MIT](./LICENSE) © Dat Nguyen
