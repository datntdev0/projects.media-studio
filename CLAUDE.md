# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repository root; the root scripts fan out over the workspace with `pnpm -r`.

```bash
pnpm install            # single lockfile wires up both packages
pnpm dev                # backend + frontend in parallel
pnpm dev:backend        # NestJS on :3001 (override with PORT)
pnpm dev:frontend       # Nuxt on :3000
pnpm dev:infrastructure # Docker: Firebase Services, Scraping Service, Redis
pnpm seed:firebase      # put admin@datntdev.com / StrongPassword123! into the emulator
pnpm generate:api       # NSwag rewrites frontend/app/utils/api.clients.ts
pnpm lint               # every package (pnpm lint:fix to autofix)
pnpm typecheck          # every package
```

Targeting one package:

```bash
pnpm --filter @media-studio/backend run test -- app.controller     # single Jest file/pattern
pnpm --filter @media-studio/backend run test:watch                 # Jest in watch mode
```
## Architecture

pnpm workspace monorepo, two packages (`pnpm-workspace.yaml`):

| Package | Path | Stack |
| --- | --- | --- |
| `@media-studio/backend` | `backend/` | NestJS 11, port 3001 |
| `@media-studio/frontend` | `frontend/` | Nuxt 4 + Nuxt UI 4 + Tailwind 4, port 3000 |

`scraping/` is a Python + FastAPI service outside the workspace, started by
`pnpm dev:infrastructure` and published on :8000. See `scraping/README.md`.

