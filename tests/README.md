# @media-studio/tests

Playwright end-to-end tests, in two projects that run against a Media Studio
instance already up — the suite starts no servers of its own.

Part of the [projects.media-studio](../README.md) monorepo. Install from the
repository root, not from here.

| Project | Specs | Target | Default |
| --- | --- | --- | --- |
| `web` | `specs/web` | Nuxt app in Chromium | `http://localhost:3000` |
| `api` | `specs/api` | NestJS API over HTTP, no browser | `http://localhost:3001` |

`E2E_WEB_URL` and `E2E_API_URL` override the two targets.

## Setup

```bash
pnpm install                                    # from the repository root
pnpm --filter @media-studio/tests exec playwright install chromium
```

Only the `web` project needs the browser; `api` uses the `request` fixture and
runs without one.

## Running

Bring the app up first — [Getting started](../README.md#getting-started) in full,
or `pnpm dev:infrastructure` then `pnpm dev` if the checkout is already
configured — and:

```bash
pnpm test:e2e             # both projects
pnpm test:e2e:web         # browser specs only
pnpm test:e2e:api         # API specs only, no browser needed
pnpm test:e2e:ui          # Playwright UI mode
pnpm test:e2e:report      # open the last HTML report
```

`pnpm test` at the root stays on the unit suites; end-to-end runs are opt-in
through `pnpm test:e2e`.

Two reporters, set in [`playwright.config.ts`](./playwright.config.ts): `list`,
so a run says what it did on the terminal, and `html`, which keeps the traces
and the failure screenshots behind that. A trace is recorded on the first retry,
a screenshot only on a failure. `expect` waits 15s rather than the default 5s —
the app boots the Firebase SDK before its auth middleware can redirect, and
parallel specs share one Nuxt dev server.

## What is covered

Signed-out behaviour only, so a run needs no seeded account:

- **`specs/api/system.spec.ts`** — `/health` reports the process is serving,
  `/system` identifies the build, `/openapi.json` is published.
- **`specs/api/auth.spec.ts`** — a request carrying no token and one carrying a
  token that cannot be verified are both refused; an unknown route is a `404`.
- **`specs/web/login.spec.ts`** — a signed-out visitor lands on sign in, the
  route they asked for is remembered across the bounce, the form asks for both
  fields before it submits, and the password can be revealed.

## In CI

The `e2e` job in
[`continuous_integration.yml`](../.github/workflows/continuous_integration.yml)
runs after the unit job: it brings up the emulators and Redis, copies both
`.env.example` files, starts `pnpm dev`, waits for `/health` and the web app to
answer, and then runs the suite. `CI` is what turns on two retries and a single
worker. The `list` output goes into the job summary either way, and the HTML
report is uploaded as the `playwright-report` artifact when the run is red.
