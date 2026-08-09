# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repository root; the root scripts fan out over the workspace with `pnpm -r`.

```bash
pnpm install          # single lockfile wires up all three packages
pnpm dev              # backend + frontend in parallel
pnpm dev:backend      # NestJS on :3001 (override with PORT)
pnpm dev:frontend     # Nuxt on :3000
pnpm lint             # every package (pnpm lint:fix to autofix)
pnpm typecheck        # every package
pnpm test             # unit tests — backend Jest and frontend Vitest
pnpm test:coverage    # the same, with coverage; what CI runs
pnpm test:e2e         # Playwright suite in tests/
```

Targeting one package:

```bash
pnpm --filter @media-studio/backend run test -- app.controller     # single Jest file/pattern
pnpm --filter @media-studio/backend run test:e2e                   # backend supertest e2e (test/jest-e2e.json)
pnpm --filter @media-studio/frontend run test -- app-nav-link      # single Vitest file/pattern
pnpm --filter @media-studio/frontend run test:watch                # Vitest in watch mode
pnpm --filter @media-studio/tests run e2e -- --project=api         # one Playwright project
pnpm --filter @media-studio/tests run e2e -- specs/web/smoke.spec.ts
```

Playwright browsers are a one-time install: `pnpm --filter @media-studio/tests run e2e:install`. CI (`.github/workflows/continuous_integration.yml`, Node 22) runs lint → typecheck → test:coverage → build → test:e2e, and uploads the coverage and Playwright reports as artifacts; the coverage totals land in the run's job summary.

## Architecture

pnpm workspace monorepo, three packages (`pnpm-workspace.yaml`):

| Package | Path | Stack |
| --- | --- | --- |
| `@media-studio/backend` | `backend/` | NestJS 11, port 3001 |
| `@media-studio/frontend` | `frontend/` | Nuxt 4 + Nuxt UI 4 + Tailwind 4, port 3000 |
| `@media-studio/tests` | `tests/` | Playwright, drives both |

The backend is a layered skeleton with no feature domains yet; the frontend is an app shell with the design system applied and no feature screens yet.

### Backend

Three layers, dependencies pointing one way only: **controller → manager → repository**. A controller owns HTTP and nothing else; a manager owns the business rules and stays framework-free (no decorator beyond `@Injectable()`, no `Request`/`Response`), which is what lets its specs run without a Nest fixture; a repository owns persistence for one aggregate. A controller never reaches past its manager to a repository.

Modules are feature-first — `src/system/` holds its own controllers, manager and DTOs — with `src/core/` for the cross-cutting layer, imported once by `AppModule`.

- `core/configure-app.ts` owns the served surface: global `api` prefix, URI versioning, validation pipe, request-log interceptor, exception filter. `main.ts` and `test/app.e2e-spec.ts` both call it, so the e2e suite asserts the real wiring rather than a copy.
- `core/api.constants.ts` is the URL space. The API is `/api/v1/…`; `/health` opts out of both prefix and version (`VERSION_NEUTRAL` plus the `exclude` list) because liveness probes should not track API versions — **`tests/playwright.config.ts` probes `/health` for readiness, and Playwright treats a 404 as "not up yet"**, so moving or versioning it stalls the whole e2e suite for two minutes.
- `core/config/` validates the environment at boot with class-validator and fails fast, listing every bad variable. Providers read settings through `AppConfigService`, never `process.env`.
- `core/logging/` extends Nest 11's `ConsoleLogger` — JSON in production, colour elsewhere — and adds a request id from an `AsyncLocalStorage` context, so a line ten calls deep is attributable without threading an argument through. Every response echoes `x-request-id`.
- Docs are Swagger UI at `/docs` with the document at `/openapi.json`, gated on `API_DOCS_ENABLED`. Generate the document after the prefix and versioning are applied or the paths come out wrong.

Declare a repository — or any seam with more than one implementation — as an `abstract class` used as both type and DI token, provided with `{ provide: Abstract, useClass: Concrete }`. Modules export managers, never repositories. There is no generic base repository on purpose. Storage is not chosen yet.

Unit specs live beside the file they cover (`*.spec.ts` under `src/`); the supertest suite is `test/app.e2e-spec.ts`. Jest loads `reflect-metadata` via `setupFiles` — a spec importing a decorated class directly does not otherwise get it.

### Frontend

Nuxt 4 layout (`frontend/app/`), auto-imported components and composables. The shell is:

- `layouts/default.vue` — `UDashboardGroup` wrapping `<AppSidebar>` and the command palette.
- `AppPage` — every route renders one. It owns the navbar (sidebar toggle, title, actions) and the scrolling body, so pages only supply a title/hint and body content. A page with no body falls back to `<AppPageSlot>`, a dashed placeholder frame.
- `composables/useNavigation.ts` — the single source of truth for the five sections (Dashboard / Workflow / Library / Scrapings / Settings). It feeds the sidebar, the command palette, and the `g-*` keyboard shortcuts. Add a route here, not just in `pages/`.

Icons are bundled client-side via `nuxt.config.ts`'s `icon.clientBundle.scan` glob, which is widened to `.ts` because `useNavigation.ts` holds icon names. Icons referenced only from a file the scanner misses will warn on SSR and appear late.

Frontend lint config extends the generated `.nuxt/eslint.config.mjs`, which only exists after `nuxt prepare` (the package's `postinstall`). If `pnpm lint` fails to resolve it, run `pnpm --filter @media-studio/frontend exec nuxt prepare`.

### Design system ("Industry")

`DESIGN.md` at the root is the authority; read it before touching anything visual. The essentials:

- Tokens live in `frontend/app/assets/css/`. `main.css` holds primitives inside `@theme static` (the only place literal colours/lengths belong — Tailwind reads `@theme` from the entry stylesheet only, so it cannot be split out). `tokens.css` derives semantic roles and bridges them onto Nuxt UI's `--ui-*` variables. `base.css` sets element defaults; `blueprint.css` holds `.blueprint` / `.duotone`.
- Application code reads roles (`--color-muted`, `--space-3`), never primitives and never literals. If a value is missing, add a token.
- Density is 0.85×: Tailwind's `--spacing` base is rebased to 3.4px, so `p-3` *is* `--space-3`. Never write a raw length.
- Everything is square (`--ui-radius: 0`), containers are hairline-bordered line drawings with four `+` registration marks (`<AppBlueprint>`, or `.blueprint-marks` where child elements can't be injected). The solid primary button is the only filled object.
- Restyle Nuxt UI through the token bridge, not with literal values on a component. `app.config.ts` carries only what CSS variables can't express (palette-to-role mapping, per-component class overrides, the Lucide stroke-width 1.5 hook).

### Frontend unit tests

Vitest with `@nuxt/test-utils`, specs in `frontend/test/nuxt/` (`*.spec.ts`). That path is not arbitrary: Nuxt's generated tsconfig includes `test/nuxt/**`, so specs there are covered by `nuxt typecheck` and can import `#components`. Specs elsewhere silently lose both.

`environment: 'nuxt'` gives each spec the Nuxt app context, so `mountSuspended` renders components with auto-imports, `app.config.ts` and a router — pass `route` to mount at a path. Nuxt UI parts that hang off a provider (tooltips, dropdowns, the palette) throw when mounted bare, so use `mountInApp` from `test/nuxt/utils/mount.ts`, which wraps them in `<UApp>` the way the real app does; its wrapper is rooted at `UApp`, so reach into it with `get()`/`find()`.

`test/nuxt/setup.ts` auto-unmounts after each spec. Without it a component's teleported content (an open menu, a tooltip) stays in the document and the next spec reads the leftovers as its own — which surfaces as order-dependent failures, not as an obvious leak. `vitest run --sequence.shuffle` is the way to catch that class of bug.

The `g-*` shortcut callbacks in `useNavigation` are the one deliberate coverage gap; the Playwright suite drives them for real.

### E2E tests

`tests/specs/` has one folder per Playwright project: `specs/api` (requests against the backend, `baseURL` = API) and `specs/web` (Chromium against the Nuxt app). Import `test`/`expect` from `src/fixtures/test.ts`, never from `@playwright/test`, so new fixtures land everywhere at once. Page objects go in `src/pages/`.

The config boots both dev servers itself and reuses running ones. Override with `E2E_WEB_URL` / `E2E_API_URL`, and set `E2E_NO_SERVER=1` to point the suite at an already-deployed environment.

The web specs drive the shell through the `shell` fixture (`src/pages/app-shell.ts`), which also owns `appSections` — the five sections mirrored from `useNavigation()` — and `layout`, the frame's measurements in px. Add a section there and the spec loops cover it. Use `shell.goto()`, not `page.goto()`: the shell is server-rendered, so it is on screen and inert for a beat before Vue hydrates, and clicks or keystrokes sent in that window are silently lost.

## Conventions

Code style differs per package and is enforced by each package's ESLint — match the file you're in rather than a repo-wide habit:

- `backend/` — Prettier via ESLint: semicolons, single quotes, trailing commas.
- `frontend/` and `tests/` — `@nuxt/eslint` stylistic: no semicolons, no trailing commas, 1TBS, max 3 attributes per line on single-line Vue templates.
