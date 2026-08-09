# Sign in with Firebase Authentication

## Context

`backend/src/auth/` is a deliberate mock — it compares passwords in plain text
and issues an unsigned token that is just the user's id, and its own header
comment says not to build authorization on it. The frontend has never called the
backend at all: `AppUserMenu.vue` hardcodes `{ name: 'Dat Nguyen', initials:
'DN' }` and its "Log out" item has no handler. There is no route guard anywhere,
so every page is reachable by anyone.

This change makes identity real. Firebase Authentication becomes the identity
provider: Nuxt signs users in directly against Firebase and holds the ID token;
NestJS verifies that token with `firebase-admin` and gates its own routes. The
mock is deleted rather than adapted — nothing in it survives contact with a real
token scheme.

**Scope, as decided:**

- **Email/password only.** The mockup draws Google and SSO buttons; they are not
  built, and the OR divider and social grid are not rendered.
- **Sign-in only.** No sign-up, no password reset, no email-verification gate.
  The mockup's "Forgot password?" and "Request access" links are not rendered.
- **One protected endpoint**, `GET /api/v1/me`, so the guard is proven end to end.
- **Playwright authenticates against the Firebase Auth Emulator** — no real
  project, no CI secrets.

**Out of scope, deliberately:** the frontend does not call the backend in this
change. `/me` exists to prove the guard and is exercised by the Playwright `api`
project. `useAuth().getIdToken()` is the seam the first real API call will use.

---

## Part 1 — Frontend (Nuxt)

### 1.1 The SSR problem, and the mechanism that solves it

SSR is on and Firebase auth state is client-only and asynchronous. Three failure
modes must close at once: a signed-in user reloading `/settings` must not be
bounced to `/login`; a signed-out user must not see a flash of the dashboard;
and `/` ↔ `/login` must not loop.

**(a) `app/plugins/firebase.client.ts` — `parallel: false`, async.** It awaits the
first `onAuthStateChanged` emission before returning. This is load-bearing and
invisible: Nuxt's entry does `await applyPlugins(...)` and *only then* fires
`app:created`, which is what triggers the client router run and therefore global
middleware. So by the time the guard evaluates on the client, auth state is
resolved. Write that reasoning into the file — someone will otherwise "optimise"
`parallel: false` away and break the guard silently. Bound the await with a ~5s
timeout so a wedged SDK cannot hold the app off screen.

**(b) `useCookie('ms_auth')` — the SSR hint.** Written by the plugin on *every*
emission (`'1'` / `null`), read by middleware **only** when `import.meta.server`.
It is a UX device, not a security boundary: it is a non-HttpOnly cookie anyone
can forge, and forging it buys a shell with no data because the API verifies the
real ID token on every request. Put that sentence in the file.

**(c) `app/middleware/auth.global.ts`** decides with
`import.meta.server ? hint === '1' : isSignedIn.value` — server uses the hint,
client uses the truth, never mixed. Global rather than per-page so a new route is
**protected by default**; the repo has zero `definePageMeta` precedent and a
named middleware would be fail-open.

Rejected: `import.meta.server` early-return alone still flashes the dashboard;
`ssr: false` (globally or via `routeRules`) contradicts
`AppShell.waitForInteractive()`, which is written around the shell being
server-rendered — a large blast radius to fix a redirect.

**Documented cosmetic edge:** with "Keep me signed in" unchecked, Firebase uses
per-tab `sessionStorage` while the hint cookie is per-browser, so a *second tab*
renders then bounces once. Unfixable without giving up SSR; no security effect.

**The `isConfigured` gate.** Plugin and middleware early-return when
`runtimeConfig.public.firebase.apiKey` is empty. This keeps `pnpm dev` and all 13
existing Vitest specs green — without it, `mountSuspended`'s default
`router.replace('/')` bounces every spec to `/login`. It mirrors the backend's
"reads, does not validate; falls back rather than stopping boot" philosophy, and
it is not an open door: an unconfigured frontend cannot obtain a token, so the
API refuses it everything.

> **CI does not use this path.** The emulator config *is* set in CI, so the guard
> is live there and the web specs authenticate for real (Part 3). The gate buys
> local dev and unit tests, nothing else.

### 1.2 "Keep me signed in"

Checked (the mockup's default) → `browserLocalPersistence`; unchecked →
`browserSessionPersistence`. **`setPersistence` must be awaited before
`signInWithEmailAndPassword`** — persistence is captured when the credential is
written; calling it after migrates an existing session instead. Both calls live
inside the plugin's `signIn` adapter so the ordering cannot be got wrong at a
call site. The hint cookie's `maxAge` comes from the same flag.

### 1.3 Files

| File | What |
| --- | --- |
| `frontend/package.json` | add `firebase` (pin what `pnpm add firebase` resolves) |
| `frontend/nuxt.config.ts` | `runtimeConfig.public.firebase`: `apiKey`, `authDomain`, `projectId`, `appId`, `authEmulatorHost`, all `''` |
| `frontend/.env.example` | new (`.gitignore` already has `!.env.example` — verified) |
| `app/composables/useAuth.ts` | new — the seam |
| `app/plugins/firebase.client.ts` | new — the SSR-timing guarantee |
| `app/middleware/auth.global.ts` | new — the guard |
| `app/layouts/auth.vue` | new — the 50/50 split |
| `app/pages/login.vue` | new — the form |
| `app/components/AppLockup.vue` | new — mark + wordmark, used twice |
| `app/assets/css/main.css` | add `--text-display` (52px) |
| `app/assets/css/tokens.css` | add `--color-field` / `--color-on-field` / `--color-on-field-muted` |
| `app/app.config.ts` | first `formField` / `input` / `checkbox` overrides |
| `app/components/AppUserMenu.vue` | real user; working Log out |

**`useAuth.ts`** follows the `useNavigation.ts` idiom — private `_useAuth`,
exported `createSharedComposable` wrapper. Exposes `isConfigured`, `isSignedIn`,
`displayName`, `initials`, `signIn`, `signOut`, `getIdToken`, plus three pure
exported helpers so they are testable without mounting: `toInitials`,
`authErrorMessage`, `safeRedirect` (which **must** reject `//host` and absolute
URLs — otherwise `?redirect=` is an open redirect).

Three constraints to write into the file: state lives in `useState`, not a
module-level `ref` (per-request on the server, immune to
`createSharedComposable`'s scope disposal); it stores a plain mapped `AuthUser`,
never the Firebase `User` object, which would drag methods and internal state
into the SSR payload; and it must **not import `firebase/auth` at module scope**,
because middleware runs on the server — runtime calls delegate to
`useNuxtApp().$firebaseAuth`. Type-only imports are fine.

**`auth.global.ts`** splits its policy into a pure exported
`resolveGuard(path, fullPath, signedIn, redirect)`, because `import.meta.server`
is always `false` under Vitest and the SSR branch is otherwise uncoverable.
Rules: on `/login` signed-in → `safeRedirect(redirect) ?? '/'`; on `/login`
signed-out → pass; elsewhere signed-out → `/login` with `?redirect=` (omitted
when the target is `/`); elsewhere signed-in → pass.

**`auth.vue`** owns the split so the page stays thin, mirroring how `AppPage`
owns chrome. It deliberately does **not** call `useNavigation()`, so the `g-*`
shortcuts are not registered on a screen full of text inputs. The left panel
locally re-declares `--color-mark: var(--color-on-field)` and
`--color-on-mark: var(--color-field)`, which inverts `AppMark` on the deep field
with **zero changes to `AppMark` and zero churn in `app-mark.spec.ts`**. Below
`lg` the left panel is hidden. The three stat figures are placeholder content —
hold them in a local `const` with a comment saying so.

**`login.vue`**: lockup, `Sign in` kicker (reusing the `AppPageSlot` kicker
recipe), `<h2>Welcome back</h2>`, muted subline, a `UForm` with a plain
`validate` function (no zod/valibot needed), email and password `UFormField`s,
the show/hide toggle in `UInput`'s `#trailing` slot as a ghost square button with
a swapping `aria-label` and `tabindex="-1"`, "Keep me signed in" **defaulting to
checked**, the error line, and the submit button. Carry a comment stating the
social buttons, divider and two links were dropped by decision, so nobody
restores them from the mockup.

The submit button wears `.blueprint` plus four `<i class="corner corner-*">`
children, as the mockup does. `.blueprint` sets a `--color-divider` border, which
would draw a visible hairline across the solid accent field, so scoped CSS
mirrors the reference stylesheet's fix:
`.auth-submit.blueprint { border-color: var(--color-accent) }`.

Add a safety net that also covers the plugin's timeout edge:
`watch(isSignedIn, v => { if (v) navigateTo(target()) })`.

> **Accessible names are a cross-package contract.** The Playwright setup project
> fills by label. `/login` must expose exactly `Email`, `Password`, and a
> `Sign in` button. Changing these breaks the e2e suite.

### 1.4 Design-system translation

`DESIGN.md` is the authority and the mockup drifts off-system in four places.
Three are **snapped**, one earns a token:

| Mockup | Resolution |
| --- | --- |
| 52px hero | **add `--text-display: 3.25rem`** to `main.css` — a real step above `--text-h1` (42px), and 42px is visibly not the mockup |
| 34px `h2` | snap to `--text-h2` (32px) |
| 26px stat figures | snap to `--text-h3` (25px) |
| 17px wordmark | snap to `--text-h5` (16px) |

Tokens for 1–2px deltas are churn that erodes "headings run at a fixed scale".
The 48px panel padding lands on the grid as `p-14` (14 × 3.4 = 47.6px).

`--color-field` is declared in `:root`, **not** per theme, on purpose: the panel
is theme-invariant, which is exactly why `--color-mark` (accent-900 light,
accent-300 dark) cannot be reused. `--color-on-field-muted` replaces the mockup's
`opacity: .7/.75` with the proportional `color-mix` formula the file already uses
for `--color-toned`.

`app.config.ts` gains the app's first form overrides — `formField.label` →
`font-body text-xs text-toned`, `input.base` → `bg-muted ring-default`,
`checkbox.label` → `font-body text-sm`; all resolve through tokens already
bridged. **Verify input height in a browser:** Nuxt UI's `md` sizing runs through
the rebased 3.4px `--spacing` and lands ~15% under the reference's 36px. Try
`size="lg"` first; add an explicit `min-h-*` only if that misses.

### 1.5 Error handling

`authErrorMessage` maps codes to one line each: `auth/invalid-credential` →
"That email and password don't match an account."; plus `auth/invalid-email`,
`auth/missing-password`, `auth/user-disabled`, `auth/too-many-requests`,
`auth/network-request-failed`; the configuration family (`auth/invalid-api-key`,
`auth/api-key-not-valid`, `auth/configuration-not-found`,
`auth/operation-not-allowed`) → "Sign-in isn't configured. Contact an
administrator." plus a `console.error` of the raw code, since no end user can act
on it; everything else → "Sign-in failed. Try again."

`auth/user-not-found` and `auth/wrong-password` are **deliberately absent**: with
email-enumeration protection on (the default) both collapse into
`auth/invalid-credential`, and distinct copy would leak account existence.

Renders as a form-level line immediately above the submit button, in
`--color-danger` at `--text-support`, `role="alert"`, with a
`i-lucide-triangle-alert` icon — **not** a `UAlert`: a filled block violates "the
solid primary button is the only filled object", and there is no
`--color-success` counterpart to make a status-colour family coherent.

### 1.6 Frontend unit tests

New specs in `frontend/test/nuxt/`: **`use-auth.spec.ts`** (the three pure
functions — `safeRedirect` against `//evil.com`, `https://evil.com`, and an
array-valued query); **`auth-middleware.spec.ts`** (`resolveGuard` over the 2×2
matrix plus `?redirect` construction/omission, then the default export with
`mockNuxtImport`); **`login-page.spec.ts`** — where the **negative assertions
matter most**: no "Google", "SSO", "OR", "Forgot password", "Request access";
plus the toggle flipping `type` and `aria-label`, checkbox default,
`signIn(email, password, true)` on submit, `auth/invalid-credential` rendering
the exact copy in `[role="alert"]`, and the button carrying `.blueprint` with
four `.corner` children; **`auth-layout.spec.ts`**, **`app-lockup.spec.ts`**.

Mock auto-imports with `mockNuxtImport`, not `vi.mock`. It is a **hoisted macro**
— its factory must not close over a top-level import binding; use `vi.hoisted`.

Two existing specs change, both because `AppUserMenu` no longer hardcodes a name:
`app-user-menu.spec.ts` (swap the name/initials assertions to the mocked user;
`['Profile','Theme','Log out']` is unchanged; **add** a "signs the user out"
case) and `default-layout.spec.ts` (footer assertion). Everything else survives
untouched because of the `isConfigured` gate.

`firebase.client.ts` will report partial coverage — early-return path runs in
every spec, Firebase path never does. Document it the way `CLAUDE.md` already
documents the `g-*` gap. No thresholds configured, so nothing fails.

`/login` is **not** added to `appNavLinks` — `pages.spec.ts` and the e2e
`appSections` both loop over it. Leave a comment so nobody "fixes" the omission.

### 1.7 Icons

The icon scanner is a plain regex over raw file text and `globInclude` is already
`['app/**/*.{vue,ts}']`, so `i-lucide-eye`, `i-lucide-eye-off`,
`i-lucide-triangle-alert`, `i-lucide-log-out` bundle correctly **as literal
strings**. Never construct a name — `` `i-lucide-${x}` `` is invisible to the
scanner and pops in late after an SSR warning.

---

## Part 2 — Backend (NestJS)

### 2.1 New — `backend/src/core/auth/` (cross-cutting, like `core/logging/`)

| File | Layer | What |
| --- | --- | --- |
| `token-verifier.ts` | outbound port | `VerifiedToken`, `InvalidTokenError`, `TokenVerifierUnavailableError`, `abstract class TokenVerifier` |
| `firebase-token-verifier.ts` | adapter | `firebase-admin` implementation |
| `firebase-auth.guard.ts` | HTTP | parses the header, maps errors to HTTP |
| `public.decorator.ts` | HTTP | `IS_PUBLIC` + `@Public()` |
| `current-user.decorator.ts` | HTTP | `@CurrentUser()` param decorator |
| `authenticated-request.ts` | HTTP | `AUTH_USER_PROPERTY = 'authUser'` (not `user` — express/passport squat on that) |
| `auth.module.ts` | composition | binds `TokenVerifier` and `APP_GUARD` |

`TokenVerifier` throws **domain errors, not `UnauthorizedException`** —
`backend/README.md` says a port must not return HTTP-shaped errors. The guard
does the HTTP mapping: `InvalidTokenError` → 401, `TokenVerifierUnavailableError`
→ **503** (the caller's credential was never the problem, and a 401 would send a
client into a pointless re-auth loop). Set `WWW-Authenticate: Bearer` on the 401.

`FirebaseTokenVerifier` initialises lazily inside a `protected getAuth()` seam,
memoised, under a **named** admin app so it cannot collide with a default app.
An empty `firebaseProjectId` throws `TokenVerifierUnavailableError` **without
touching firebase-admin**. Map `DecodedIdToken` → `VerifiedToken` field by field
— never spread; the point of the seam is that no Firebase-shaped object escapes
`core/auth/`.

**Emulator awareness is passive.** firebase-admin reads
`FIREBASE_AUTH_EMULATOR_HOST` from `process.env` itself. We mirror it into
`AppConfig` only so the verifier can log it once and so nothing else is tempted
to read `process.env`. Say so in the file comment — it is the one place the
"never `process.env`" rule is bent by a third party, and the comment is what
stops the next reader from "fixing" it.

**No service-account key is needed.** ID-token verification fetches Google's
*public* certs over HTTPS, so `initializeApp({ projectId })` suffices in
production too. This is what makes "no secrets" true beyond CI. (Relevant to a
gap found while planning: `backend/.gitignore` has no `.env.*` wildcard, so a
service-account JSON dropped there under any other name would not be ignored —
not needing one sidesteps this entirely.)

### 2.2 Global guard, with `@Public()`

Registered via `APP_GUARD` — mandatory anyway, since the guard injects
`TokenVerifier` and `Reflector`, and `configure-app.ts` can only register globals
built with `new X()`.

Global because it is **fail-closed**: a forgotten `@UseGuards` on a new
controller is silently public and invisible in review; a forgotten `@Public()` is
a loud 401 caught by the first CI run.

| Route | Nest route? | Action |
| --- | --- | --- |
| `GET /health` | yes | **`@Public()` on the class** |
| `GET /api/system` | yes | **`@Public()` on the class** |
| `/docs`, `/openapi.json` | **no** — registered straight on the HTTP adapter | nothing; the guard never runs |
| `GET /api/v1/me` | yes | protected — the point |
| unmatched routes | no handler | enhancers bind to handlers, so no guard runs and the 404 shape is unchanged |

Put `@Public()` on the **class**, not the method, so it survives someone adding a
second method.

> Verified aside: Playwright's readiness check treats any status in `[200, 404)`
> as up, so a 401 on `/health` would still have read as ready. The real consumers
> of that 200 are `specs/api/smoke.spec.ts` and any orchestrator — `@Public()` is
> still required, just not for the reason usually given.

### 2.3 New — `backend/src/identity/` (owns `GET /api/v1/me`)

Not `system/` (that answers *what the service is*; adding "who is calling" gives
one manager two reasons to change), not `core/auth/` (`AppModule`'s own comment
forbids a feature controller in the cross-cutting layer), not `users/` (promises
persistence this service does not have).

`identity.module.ts` (controller + manager, **no repository** — same
justification `system.module.ts` already carries), `identity.controller.ts`
(`@Controller(ME_PATH)`, `@ApiBearerAuth()`, `@CurrentUser()`),
`identity.manager.ts` (framework-free; holds the real rule — *what of the token
we are willing to echo*, and the display-name fallback `displayName` → email
local-part → `uid`), `dto/authenticated-user.dto.ts` (response DTO, no
class-validator, matching `system/dto/`).

### 2.4 Edits to existing backend files

- **`app.module.ts`** — `imports: [CoreModule, AuthModule, SystemModule, IdentityModule]`. Import `AuthModule` from `AppModule`, not from inside `CoreModule`: it consumes `AppConfigService`, which `CoreModule` exports globally, and nesting a consumer inside its own global module is needless circularity risk.
- **`core/api.constants.ts`** — replace `AUTH_PATH = 'auth'` with `ME_PATH = 'me'`, and fix the `/api/v1/…` bullet in the doc block. Do not inline `'me'`; the file's stated contract is that the URL space lives in one place.
- **`core/configure-app.ts`** — add `app.enableCors()` as the **first** middleware, before `requestContextMiddleware` (a preflight should be answered before anything else looks at it, and it is not a request worth tracing). Signature stays `(app)` — it resolves `AppConfigService` itself, so **neither caller changes**. Config-driven allowlist, never `*`; `credentials: false` (we send a Bearer header, never cookies); `allowedHeaders` must name `authorization`, `content-type`, `x-request-id` explicitly, because setting `allowedHeaders` at all discards the reflect-the-request default; **`exposedHeaders: ['x-request-id']`** — the setting people forget, without which the browser cannot read the id the service is at pains to echo.
  - *Risk:* `app.get()` before `app.init()` on the e2e path. `main.ts` already does `app.get(AppLogger)` pre-`configureApp`, so this should hold. Fallback if not: an optional second parameter `configureApp(app, config = app.get(AppConfigService))`, still zero call-site changes.
- **`core/openapi/openapi.ts`** — add `.addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', … })`. `persistAuthorization: true` is already set, so a pasted token survives a reload of `/docs`.

### 2.5 Config

Keep `AppConfig` flat, matching the existing style.

| Key | Env var | Default |
| --- | --- | --- |
| `corsOrigins: string[]` | `CORS_ORIGINS` (comma-separated) | `['http://localhost:3000']` |
| `firebaseProjectId: string` | `FIREBASE_PROJECT_ID` | `''` |
| `firebaseAuthEmulatorHost: string` | `FIREBASE_AUTH_EMULATOR_HOST` | `''` (scheme-less `host:port` — the SDK rejects `http://`) |

Getters plus `isAuthConfigured` / `isAuthEmulated`, in the existing
`isProduction`/`isTest` style. Append the three to `backend/.env.example` in that
file's voice.

**When Firebase config is absent, the service boots.** No throw, no exit.
`configuration.ts`'s contract is "reads, does not validate", and
`service-metadata.ts` already states the principle: a manifest that cannot be
read falls back rather than failing boot. A boot-time throw would make this the
one setting that behaves differently *and* would take `/health` down with it, so
an operator diagnosing a bad deploy would lose both liveness and `/docs`.
Instead it **fails closed at the point of use** — 503 from the guard, through the
existing `AllExceptionsFilter` so the body shape and `requestId` are unchanged —
plus one `OnModuleInit` warning at boot ("every protected route will answer
503"), and a second if the emulator host is set ("never do this in production").

**Two exhaustive specs must be updated or they will not compile:**
`configuration.spec.ts` (two `toEqual`s plus the env-supplying call) and
`app-config.service.spec.ts` (its `base: AppConfig` literal). Add cases in each
file's existing idiom: `it.each([[''], ['   '], [',,']])` falling back to the
default origins; splitting and trimming a list; and keeping the emulator host
as given so a bad value fails loudly at firebase-admin rather than here.

### 2.6 Removal

Delete `backend/src/auth/` entirely (11 files). Update, in order of risk:

**`backend/test/app.e2e-spec.ts`** — drop the `SessionDto, UserDto` import and
the `SEEDED` const; delete the three auth describe blocks; add
`.overrideProvider(TokenVerifier).useValue(fakeVerifier)` to the fixture (it
imports the real `AppModule`, so with a global guard it would otherwise run the
real verifier and every protected assertion would be a 503); add
`describe('GET /api/v1/me')` covering 200, no header, garbage token, non-Bearer
scheme, `/api/me` → 404, **and `/health` + `/api/system` still 200 with no
header** — that last one is the regression test for `@Public()` and belongs next
to the existing URL-space assertions.

**The sneaky one.** After removal there is no DTO-validated request body anywhere
in `src/` — `/api/v1/me` is a bodyless GET — so three tests lose their subject,
including the easily-missed one at line 203 inside `describe('errors')`. With
them goes the only end-to-end proof that `ValidationPipe`'s `whitelist` /
`forbidNonWhitelisted` and the filter's array-`message` path are actually wired.
**Add a test-only probe:** `backend/test/probe/validation-probe.controller.ts`,
`@Public() @Controller('validation-probe')`, one `@Post()` with a validated DTO,
registered via `Test.createTestingModule({ imports: [AppModule], controllers:
[ValidationProbeController] })` so it passes through the real prefix, versioning,
pipe and filter. It lives under `backend/test/`, so it is typechecked and linted
but never compiled into `dist/`, never in the OpenAPI document, never served.
*Trade-off:* the spec calls itself "the served URL space, end to end" and a
synthetic route is not served — a two-line comment settles it. The alternative
(delete the tests, move the array-`message` assertion into
`all-exceptions.filter.spec.ts`) loses the proof that the pipe is installed with
those flags, which is precisely what `configure-app.ts` exists to assert.

**`tests/specs/api/smoke.spec.ts`** — OpenAPI paths → `['/health',
'/api/system', '/api/v1/me']`; delete `test.describe('mock auth')`, replace with
`test.describe('authentication')` (§3.4).

**Docs:** `backend/README.md` (routes table, `src/` tree, delete "The mock auth
module", retarget the "Adding a domain" example — currently
`UserRepository`/`InMemoryUserRepository` — at `TokenVerifier`/
`FirebaseTokenVerifier`, now the only live example of the abstract-class-as-token
pattern), `CLAUDE.md` (the "only domain is a mock `auth`" line, the "`auth/` is
the pattern to copy" line, the `api.constants.ts` bullet, the whole "`auth/` is a
mock" paragraph, the abstract-class example, the E2E section), `tests/README.md`
(spec table, a new Authentication section, the environment table).

### 2.7 Backend unit tests

The abstract-class seam pays off here: a `FakeTokenVerifier extends
TokenVerifier` is both a valid subtype *and* accepted by
`.overrideProvider(TokenVerifier).useValue(...)`. No `jest.mock`, no module
hoisting, no firebase-admin import in any spec — worth a comment saying so.

- **`firebase-token-verifier.spec.ts`** — subclass to stub `getAuth()`. Field-by-field mapping; claims not asked for are dropped; `emailVerified` defaults false; `auth/id-token-expired` and `auth/argument-error` → `InvalidTokenError`; network error → `TokenVerifierUnavailableError`; **empty project id throws and never calls `getAuth`**; `getAuth` called once across two `verify`s.
- **`firebase-auth.guard.spec.ts`** — hand-rolled `ExecutionContext`. A `@Public()` handler passes **and the verifier is never called** (assert the call count — that is what catches a `getAllAndOverride` typo); `it.each` of no header / `''` / `Basic xyz` / `Bearer` with no token; both error mappings; success attaches under `AUTH_USER_PROPERTY`; lower-case `bearer` accepted; the 401 sets `WWW-Authenticate`.
- **`identity.manager.spec.ts`** — pure. The fallback chain, and **the result has exactly the DTO's keys** (`Object.keys(result).sort()`), which is what stops a future `...token` spread leaking raw Firebase claims.
- **`identity.controller.spec.ts`** — `managerStub()` idiom from the deleted `auth.controller.spec.ts`.

Expect a small coverage dip: the `initializeApp`/`getAuth` lines are the one
block no unit spec reaches. Do not paper over it with a contrived `jest.mock` —
the Playwright `api` project covers it against a real emulator.

---

## Part 3 — E2E and CI

### 3.1 The emulator

Add `firebase-tools` (^15) as a devDependency of `@media-studio/tests`, so
`pnpm install --frozen-lockfile` covers it and **CI needs no extra install step**.
New `tests/firebase.json` with `auth` on `127.0.0.1:9099`, UI disabled,
`singleProjectMode: true`. With a **`demo-` prefixed project id**
(`demo-media-studio`) the CLI runs fully offline — no login, no credentials, no
`.firebaserc`.

**The Auth emulator does not need Java** — only Realtime Database, Firestore and
part of Cloud Storage are Java-based. This is the plan's riskiest CI assumption
(docs-based, not executed). If the first CI run disagrees, add
`actions/setup-java@v4` (temurin 21) before the E2E step — a 15-second fix, not a
redesign.

`tests/playwright.config.ts` gains a third `webServer`, **first in the array**,
running `firebase emulators:start --only auth --project ${firebaseProjectId}`,
with **both** `url` (the emulator config endpoint) and `wait: { stdout: /All
emulators ready/i }` — Playwright races them, and **only `url` populates the
reuse check**, so dropping it would start a second emulator onto a busy port
locally. The backend `webServer` gains `env: { FIREBASE_PROJECT_ID,
FIREBASE_AUTH_EMULATOR_HOST, CORS_ORIGINS }`; the frontend gains the
`NUXT_PUBLIC_FIREBASE_*` set. Gate all three on the existing `managesServers` so
`E2E_NO_SERVER=1` still works.

**The backend's `FIREBASE_PROJECT_ID` must equal the emulator's `--project`.**
Emulator tokens are unsigned, and firebase-admin gates the `kid`/`alg` checks
behind emulator mode — but `aud`, `iss`, `sub` and `exp` are still enforced. Both
values come from one constant in `playwright.config.ts` for exactly this reason.

### 3.2 Seeding

New `tests/src/auth/emulator.ts` (under `src/`, so `tests/tsconfig.json`
typechecks it) using Node 22's global `fetch` against the emulator's Identity
Toolkit surface: `accounts:signUp`, `accounts:signInWithPassword`,
`accounts:update` for the display name, and `DELETE
/emulator/v1/projects/{id}/accounts` to clear. Clear **before** seeding so a
reused local emulator does not 400 with `EMAIL_EXISTS`.

REST rather than the Admin SDK (which would pull a backend dependency into the
e2e package to create one user) or `--import` (opaque, hand-regenerated, rots
silently). Three fetches, readable in the diff, and it also supplies the `api`
project's token.

### 3.3 Carrying the session — the critical detail

The Firebase JS SDK persists browser auth state in **IndexedDB**, not
localStorage or cookies. `storageState({ indexedDB: true })` **exists and works
in the installed Playwright 1.62.1** — both capture and restore were verified in
the package, and the option's own doc comment names Firebase Authentication.

**Two hard constraints:**

1. **The round-trip must go through a file path.** `storageState()`'s TypeScript
   return type omits `origins[].indexedDB`, so only
   `storageState({ path, indexedDB: true })` → `use: { storageState: path }`
   carries it through typed code.
2. **`tests/.auth/user.json` must be gitignored** — append `/.auth` to
   `tests/.gitignore`. Root `.gitignore` does not cover it.

A new `setup` project (`tests/specs/setup/auth.setup.ts`) clears and seeds the
user, then performs a **real UI sign-in** and saves the state. `api` and `web`
both declare `dependencies: ['setup']`; `web` adds `use: { storageState }`.

Rejected: programmatic `page.evaluate` sign-in needs the app to expose an
internal for tests and re-runs per context; hand-writing the
`firebaseLocalStorageDb` record depends on an **undocumented internal format**
that fails as a mysterious "signed out" rather than an obvious error. The UI
sign-in also proves the login screen works on every run, for free.

The setup must call `waitForInteractive()` before saving — do not persist a
half-hydrated session.

### 3.4 Keeping every existing web spec green

The key move: **the seeded user's display name is `Dat Nguyen`**, so no existing
assertion changes meaning — but the literal moves to one place. New
`tests/src/fixtures/test-user.ts` exports `testUser`; `app-shell.ts:92` and
**`specs/web/sidebar.spec.ts:85`** (a second hardcode, easy to miss) both read
`testUser.displayName`. Add `accountMenu` and `signOut()` to `AppShell`.

Every web spec starts with `shell.goto()` → `navbarTitle.waitFor()` →
`waitForInteractive()`. With `storageState` restoring IndexedDB before the first
navigation, the app is already signed in and the shell renders as before. **No
spec body changes beyond the two literals.**

> **The single most likely cause of a red first run** is the frontend redirecting
> on "signed out" before `onAuthStateChanged` has restored from IndexedDB — every
> web spec would flap on `navbarTitle.waitFor()`. §1.1(a) is what prevents it;
> if the suite flaps, look there first.

New `tests/specs/web/auth.spec.ts`: an unauthenticated context
(`test.use({ storageState: { cookies: [], origins: [] } })`) redirects `/` to
`/login`; signing in lands on the dashboard; `shell.signOut()` returns to
`/login` and a reload stays there.

The `api` project gets its token from a **worker-scoped fixture** calling
`accounts:signInWithPassword` once per worker. Its `authentication` describe
block covers: a valid token resolves the caller; no token → 401; unverifiable
token → 401; non-Bearer scheme → 401; `/api/me` → 404; and **`/health` +
`/api/system` open with no token** — the test that catches a missing `@Public()`.

`specs/web/smoke.spec.ts` is unchanged; its `expect(errors).toEqual([])` is now a
genuine Firebase-misconfiguration detector, worth a one-line comment saying so.

### 3.5 CI

Add a **job-level** `env:` block (no secrets, no `secrets.*`): `FIREBASE_PROJECT_ID:
demo-media-studio`, `FIREBASE_AUTH_EMULATOR_HOST: 127.0.0.1:9099`, `CORS_ORIGINS`,
and the `NUXT_PUBLIC_FIREBASE_*` set. Job-level rather than step-level so **both
`Build` (`nuxt build`) and `Test E2E` see it** — correct whether the frontend
reads them at runtime via `runtimeConfig.public` or bakes them at build time.

**No new steps.** Not `setup-java` (§3.1), not a firebase-tools install (workspace
devDependency), not an emulator start (Playwright's `webServer` owns it, matching
how the other two servers are already handled). Consider raising
`timeout-minutes` 30 → 40 if runs come close.

*Side effect:* the unit-test step inherits `FIREBASE_AUTH_EMULATOR_HOST`.
Harmless — every backend spec fakes `TokenVerifier` and never constructs the real
one. If that stops being true, move the two vars to step-level.

---

## Landing order

1. Config (`configuration.ts`, `app-config.service.ts`, both specs, `.env.example`).
2. CORS in `configure-app.ts` + `.addBearerAuth()`.
3. `core/auth/` + its two specs, **not yet wired into `AppModule`**.
4. **One commit, whole:** `identity/` + specs, `ME_PATH`, wire both modules into `AppModule`, `@Public()` on `HealthController` and `SystemController`, delete `src/auth/`, rewrite `test/app.e2e-spec.ts` including the probe controller. The repo does not typecheck between 3 and 4.
5. Frontend: tokens → `useAuth` → plugin → middleware → layout → page → `AppUserMenu`, with specs alongside.
6. `tests/`: firebase-tools, `firebase.json`, emulator helper, `playwright.config.ts`, `testUser`, the two literals, `api/smoke.spec.ts`. Runnable with `--project=api` before `/login` exists.
7. CI `env:` block.
8. `auth.setup.ts` + `web/auth.spec.ts` — depends on both halves; land last.
9. Docs: `backend/README.md`, `CLAUDE.md`, `tests/README.md`.

## Verification

```bash
pnpm lint && pnpm typecheck                      # catches the config-spec and e2e-spec breaks
pnpm test:coverage                               # backend Jest + frontend Vitest
pnpm --filter @media-studio/backend run test:e2e # the guard, @Public(), the 404 shape, the probe
pnpm --filter @media-studio/frontend run test -- --sequence.shuffle   # teleport leakage
pnpm --filter @media-studio/tests run e2e -- --project=api            # emulator + real token
pnpm --filter @media-studio/tests run e2e                             # full suite incl. setup
```

Manual, against `pnpm dev` with the emulator running:

1. `/settings` signed out → lands on `/login?redirect=/settings`, **no dashboard flash**.
2. Sign in → returns to `/settings`; sidebar shows the real name and initials.
3. Hard-reload `/settings` → **stays**, no bounce through `/login`.
4. Sign out from the account menu → `/login`; reload stays there.
5. Wrong password → the mapped copy inside `[role="alert"]`, button leaves loading.
6. Toggle the password eye; toggle light/dark and confirm the left panel stays deep.
7. Unset `NUXT_PUBLIC_FIREBASE_API_KEY` → app runs unguarded (the documented dev gate).
8. Unset `FIREBASE_PROJECT_ID` on the backend → boots, warns once, `/health` and `/api/system` still 200, `/api/v1/me` → 503.
9. `/docs` → Authorize with an emulator token → `GET /api/v1/me` returns 200.

## Open risks

| Risk | Mitigation |
| --- | --- |
| Auth emulator needing Java (docs-based conclusion) | first CI run tells you; add `setup-java@v4` temurin 21 |
| `app.get()` before `app.init()` in `configureApp` | fallback is an optional second parameter; zero call-site change |
| Nuxt UI input height under the rebased 3.4px spacing | try `size="lg"`, then an explicit `min-h-*` |
| Emulator readiness URL unverified | the `wait: { stdout }` race still yields a green start |
| `accounts:signUp` accepting `displayName` inline | fall back to a follow-up `accounts:update`; fails loudly on first local run |
