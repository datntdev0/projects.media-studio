# @media-studio/tests

Playwright end-to-end tests, in two projects that run against a Media Studio
instance already up — the suite starts no servers of its own.

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

## Running

Bring the app up first — `pnpm dev:infrastructure`, then `pnpm dev` — and:

```bash
pnpm test:e2e             # both projects
pnpm test:e2e:web         # browser specs only
pnpm test:e2e:api         # API specs only, no browser needed
pnpm test:e2e:ui          # Playwright UI mode
pnpm test:e2e:report      # open the last HTML report
```

`pnpm test` at the root stays on the unit suites; end-to-end runs are opt-in
through `pnpm test:e2e`.

## What is covered

Signed-out behaviour only, so a run needs no seeded account: the API's
unauthenticated surface (`/health`, `/system`, `/openapi.json`) and its refusal
of untokened requests, and the web app's sign-in screen and the redirect that
sends visitors there.
