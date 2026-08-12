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
- A Java runtime (JDK 11+) on the `PATH` — the Firestore emulator runs on the JVM. Nothing else in the repository needs it, and the Auth emulator runs without it.

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
pnpm dev:infrastructure   # Auth :9099, Firestore :8080, Storage :9199, Emulator UI :4000, FlareSolverr :8191
pnpm seed:firebase        # creates admin@datntdev.com / StrongPassword123!
```

The emulators run in Docker — [`_deploy/dockercompose.local.infrastructure.yml`](./_deploy/dockercompose.local.infrastructure.yml) — published on `127.0.0.1` on the ports each package's `.env` already points at. Leave the stack running in its own terminal and start the app as usual. Beside the emulators it runs [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr), the proxy the scraping work will send its requests through.

Firestore is where everything the API stores itself lives, and Storage holds the media files — cover images today. Both are exported to a Docker volume when the stack is stopped and read back when it starts, so the seeded account outlives a restart and `pnpm seed:firebase` is a one-off rather than something to repeat.

The emulator config — `firebase.json`, `.firebaserc` and the rules — lives in [`_deploy/firebase/`](./_deploy/firebase) and is baked into the image, so edits to it need a rebuild. `dev:infrastructure` passes `--build`, which is enough.

Storage is the one thing the browser talks to directly: a cover image is uploaded from the picker to the bucket, and only the download URL it comes back with is sent to the API. [`storage.rules`](./_deploy/firebase/storage.rules) is therefore the whole guard on that path — a file lives under the uid that wrote it.

Both packages read their Firebase settings from a gitignored `.env` — copy each package's `.env.example` to get the emulator defaults. See [`_docs/plan/[auth]-google_firebase_authentication_integration.md`](./_docs/plan/%5Bauth%5D-google_firebase_authentication_integration.md) for how the pieces fit together.

## License

[MIT](./LICENSE) © Dat Nguyen
