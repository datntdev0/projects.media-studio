# projects.media-studio

An automated toolbox for generating rich media content across text, images, audio, and video. Designed to streamline creative workflows with modular components and fully customizable pipelines.

## Repository layout

This is a pnpm workspace monorepo.

| Package | Path | Stack |
| --- | --- | --- |
| `@media-studio/backend` | [`backend/`](./backend) | NestJS 11 API (default port `3001`) |
| `@media-studio/frontend` | [`frontend/`](./frontend) | Nuxt 4 + Nuxt UI dashboard (default port `3000`) |
| `@media-studio/tests` | [`tests/`](./tests) | Playwright end-to-end suite |

[`scraping/`](./scraping) is a Python + FastAPI service outside the workspace, published on port `8000` and started with the rest of the local infrastructure. [`_deploy/`](./_deploy) holds the Docker Compose file and the Firebase emulator config that infrastructure is built from.

## Prerequisites

- Node.js `>=22`
- pnpm `11.18.0` (pinned via the `packageManager` field — run `corepack enable` to have it picked up automatically)
- Docker, for the local infrastructure. The Firebase emulators, the scraping service and Redis all run as containers, and the JRE the Firestore and Storage emulators need is inside the image rather than on the host.
- The .NET 9 runtime, only to regenerate the API client — see [the frontend README](./frontend/README.md#the-generated-api-client). The committed client builds and typechecks without it.

## Getting started

Five steps, all run from the repository root. Steps 1 to 4 are once per checkout; step 5 is what you repeat.

### 1. Install the dependencies

```bash
pnpm install
```

Installing from the root wires up every package against a single lockfile. Do not install from inside a package.

### 2. Start the local infrastructure

```bash
pnpm dev:infrastructure
```

Leave this in its own terminal — it runs in the foreground and stops the stack on `Ctrl+C`. The first run builds the images, which takes a while: the scraping service bakes a stealth Chromium into its own.

| Service | Address | What it is |
| --- | --- | --- |
| Emulator UI | <http://127.0.0.1:4000> | Browse the emulated Auth users, Firestore documents and files |
| Authentication | `127.0.0.1:9099` | Where accounts and ID tokens come from |
| Firestore | `127.0.0.1:8080` | Everything the API stores itself |
| Realtime Database | `127.0.0.1:9000` | Live scraping status the browser subscribes to |
| Storage | `127.0.0.1:9199` | Media files — cover images and chapter text |
| Scraping API | <http://127.0.0.1:8000/docs> | The FastAPI service in [`scraping/`](./scraping) |
| Redis | `127.0.0.1:6379` | What the BullMQ job queues run on |

Everything is published on `127.0.0.1` only, on the ports the `.env.example` files already point at. The emulators export their data to a Docker volume when the stack stops and read it back when it starts, so accounts and documents outlive a restart.

### 3. Configure the two apps

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

In PowerShell, `Copy-Item backend/.env.example backend/.env`.

Both examples are already pointed at the emulators from step 2, so nothing needs editing to run locally. Both `.env` files are gitignored, and every variable in them is documented in place. The backend also reads `.env.local` first, if you keep one.

### 4. Seed the development account

```bash
pnpm seed:firebase
```

Creates `admin@datntdev.com` / `StrongPassword123!` in the Auth emulator. It is idempotent, and the emulator keeps its data across restarts, so this is a one-off rather than something to repeat. The infrastructure from step 2 has to be up.

### 5. Start the apps

```bash
pnpm dev
```

| | Address |
| --- | --- |
| Web app | <http://localhost:3000> |
| API | <http://localhost:3001> |
| Swagger UI | <http://localhost:3001/docs> |

Sign in with the seeded account. `pnpm dev:backend` and `pnpm dev:frontend` start one side on its own, which is the quicker loop when you are only working on one.

### If something does not come up

| Symptom | Cause |
| --- | --- |
| The API exits asking for a service account | An emulator host is missing from `backend/.env`. All four together are what stand in for a credential |
| Sign-in hangs or rejects a correct password | The Auth emulator is not running, or step 4 was skipped |
| The dashboard loads but every call fails | `NUXT_PUBLIC_API_BASE` and the API's `CORS_ORIGINS` disagree, or the API is not running |
| A scraping job never leaves `queued` | Redis or the scraping service is down. Check with `docker compose -f _deploy/dockercompose.local.infrastructure.yml ps` |

## Common commands

Run from the repository root; each fans out across every workspace package.

```bash
pnpm dev          # start backend and frontend together
pnpm build        # build every package
pnpm lint         # lint every package (lint:fix to autofix)
pnpm typecheck    # typecheck every package
pnpm test         # unit tests
pnpm test:cov     # unit tests with coverage
pnpm test:e2e     # Playwright, against an app that is already running
```

To target a single package:

```bash
pnpm dev:backend
pnpm dev:frontend

pnpm --filter @media-studio/backend run test -- library.manager
```

`pnpm generate:api` regenerates the frontend's API client from the running backend — see [the frontend README](./frontend/README.md#the-generated-api-client). Run it after any change to a controller, a route or a DTO.

## Documentation

| Where | What it covers |
| --- | --- |
| [`backend/README.md`](./backend/README.md) | Routes, the controller/manager/repository layering, configuration, queues |
| [`frontend/README.md`](./frontend/README.md) | App structure, the generated API client, the design system |
| [`scraping/README.md`](./scraping/README.md) | The scraping endpoints, and why the browser is set up the way it is |
| [`tests/README.md`](./tests/README.md) | The end-to-end suite and what it covers |
| [`DESIGN.md`](./DESIGN.md) | The Industry design system the dashboard is skinned with |
| [`_docs/plan/`](./_docs/plan) | The plan behind each feature, in the order they were built |

## License

[MIT](./LICENSE) © Dat Nguyen
