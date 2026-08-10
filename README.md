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

## Authentication

Sign-in is Firebase Authentication: the browser exchanges credentials with Firebase directly, and the API only ever verifies the ID token it is handed. Locally that runs against the [Auth emulator](https://firebase.google.com/docs/emulator-suite), so no Firebase project or network access is needed.

```bash
pnpm dev:firebase     # Auth emulator on :9099, Emulator UI on :4000
pnpm seed:firebase    # creates dat@media.studio / password
```

Leave the emulator running in its own terminal and start the app as usual. The emulator keeps nothing between runs, so re-run `pnpm seed:firebase` after each restart.

Both packages read their Firebase settings from a gitignored `.env` — copy each package's `.env.example` to get the emulator defaults. See [`_docs/plan/[auth]-google_firebase_authentication_integration.md`](./_docs/plan/%5Bauth%5D-google_firebase_authentication_integration.md) for how the pieces fit together.

## License

[MIT](./LICENSE) © Dat Nguyen
