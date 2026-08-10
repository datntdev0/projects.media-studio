# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repository root; the root scripts fan out over the workspace with `pnpm -r`.

```bash
pnpm install          # single lockfile wires up all three packages
pnpm dev              # backend + frontend in parallel
pnpm dev:backend      # NestJS on :3001 (override with PORT)
pnpm dev:frontend     # Nuxt on :3000
pnpm dev:firebase     # Auth emulator on :9099, Firestore on :8080, Emulator UI on :4000
pnpm seed:firebase    # put admin@datntdev.com / StrongPassword123! into the emulator
pnpm lint             # every package (pnpm lint:fix to autofix)
pnpm typecheck        # every package
```

Targeting one package:

```bash
pnpm --filter @media-studio/backend run test -- app.controller     # single Jest file/pattern
pnpm --filter @media-studio/frontend run test -- app-nav-link      # single Vitest file/pattern
pnpm --filter @media-studio/frontend run test:watch                # Vitest in watch mode
```
## Architecture

pnpm workspace monorepo, three packages (`pnpm-workspace.yaml`):

| Package | Path | Stack |
| --- | --- | --- |
| `@media-studio/backend` | `backend/` | NestJS 11, port 3001 |
| `@media-studio/frontend` | `frontend/` | Nuxt 4 + Nuxt UI 4 + Tailwind 4, port 3000 |
| `@media-studio/tests` | `tests/` | Playwright, drives both |

## Instructions

### Coding Style

- Do not write too long comments inside the code.
- Do not write too complex code. Keep it simple and readable.
- Do not write import in multiple lines. Use single line import.
- Do not break the line if the line is not too long. Keep it in a single line.
- Prefer to use the tailwind classes instead of writing custom CSS.
- Do not write `<style>` tag in the Nuxt component. Use the CSS file or tailwind classes.
- Use `pnpm typecheck` to ensure TypeScript types are correct.
- Use `pnpm lint` and `pnpm lint:fix` to check and fix the linting issues.
