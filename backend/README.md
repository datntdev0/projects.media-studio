# @media-studio/backend

The Media Studio API — a [NestJS](https://nestjs.com) service that exposes the media generation pipelines to the frontend.

Part of the [projects.media-studio](../README.md) monorepo. Install from the repository root, not from here.

## Development

```bash
pnpm dev:backend   # from the repository root
pnpm dev           # or from this directory
```

Listens on `http://localhost:3001` (override with `PORT`).

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/v1/auth/me` | The account the ID token belongs to |
| `PATCH /api/v1/auth/me/password` | Change that account's password |
| `GET /system` | Service name, build, environment, default API version |
| `GET /health` | Liveness |
| `/docs` | Swagger UI |
| `/openapi.json` | The generated OpenAPI document |

Two tiers, wired in `src/core/configure-app.ts` and named in `src/core/api.constants.ts`:

- **`/api/v1/…`** — the API proper. Anything whose payload can change between versions lives here and gets `/v1` by default.
- **`/system`, `/health`, `/docs`, `/openapi.json`** — outside the prefix and the version. What the service is and whether it is alive are not per-version questions, and the docs describe every version rather than living inside one.

Every response carries an `x-request-id`, echoing the inbound one if there was one. Failures answer in a single shape (`statusCode`, `message`, `error`, `requestId`, `path`, `timestamp`), so the id in a bug report is enough to find the request in the logs.

## Authentication

There is no sign-in endpoint. The browser exchanges credentials with Firebase Authentication directly, so no password reaches this service; both `auth/` routes sit behind `FirebaseAuthGuard`, which verifies the bearer ID token with the Admin SDK and hands the decoded claims to the handler through `@CurrentUser()`. Expired, malformed and forged tokens all answer `401` — which of them it was goes to the log.

Changing a password is the one exception to "the Admin SDK is enough": it can set a password but cannot check one, so `IdentityToolkitClient` proves the current password over the same REST API the browser uses before `updateUser` runs. Without that, a stolen token would be enough to lock an account's owner out.

Locally this runs against the [Auth emulator](../README.md#authentication) — `FIREBASE_AUTH_EMULATOR_HOST` makes the Admin SDK skip the signature check and use no credential at all, so the guard is only as good as the emulator is private.

## Architecture

Three layers, dependencies pointing one way: **controller → manager → repository**. No domain owns a repository yet — `auth/` reads accounts from Firebase and `system/` has nothing to store — but the contract below is what one gets when a datastore is chosen.

| Layer | Owns | May depend on | Must not |
| --- | --- | --- | --- |
| Controller | Routes, DTO validation, status codes, OpenAPI decorators | its own module's manager | hold business rules, or touch a repository |
| Manager | Use cases and business rules | repositories, other modules' exported managers | see `Request`/`Response`, or build queries |
| Repository | Persistence for one aggregate | its data source | hold business rules, or return HTTP-shaped errors |

Managers stay framework-free — no decorator beyond `@Injectable()`, no HTTP types — so they can be constructed directly, without a Nest fixture.

```
src/
  main.ts                  bootstrap only: logger, configureApp, docs, listen
  app.module.ts            composition root: core, then one import per feature
  core/                    cross-cutting, imported once by AppModule
    api.constants.ts       the shape of the URL space
    configure-app.ts       prefix, versioning, pipe, interceptor, filter
    service-metadata.ts    name and version, read from package.json
    config/                environment reader and its typed accessor
    logging/               logger, request context, request log line
    http/                  the global exception filter
    firebase/              the Admin SDK app, initialised once
    openapi/               document and Swagger UI
  auth/                    controller over manager, guard, token verification
  system/                  two controllers over one manager, no repository
```

Modules are feature-first: a domain folder holds its own controller, manager and repository.

### Adding a domain

`auth/` is the shape to copy for a controller over a manager. When the domain needs persistence, the repository is an `abstract class` — both the type the manager is checked against and the token Nest resolves:

```ts
// library/item.repository.ts
export abstract class ItemRepository {
  abstract findById(id: string): Promise<Item | null>;
}

// library/library.module.ts — the only line that knows what backs it
@Module({
  controllers: [LibraryController],
  providers: [
    LibraryManager,
    { provide: ItemRepository, useClass: PostgresItemRepository },
  ],
  exports: [LibraryManager], // never the repository
})
export class LibraryModule {}
```

A module exports managers, never repositories — persistence stays private to the domain that owns it. There is no generic base repository: each aggregate declares the methods it actually needs, so swapping the datastore is one line in the module with nothing to change in the manager or the controller.

## Configuration

Every variable is documented in [`.env.example`](.env.example) and lifted into a typed object by `src/core/config/configuration.ts`, which reads and defaults but does not validate: an unusable value falls back to its default rather than stopping the process. `.env.local` is read before `.env`; neither is committed.

Providers read settings through `AppConfigService`, so `process.env` is interpreted in exactly one file. The single exception writes rather than reads: `FirebaseAdminService` puts `FIREBASE_AUTH_EMULATOR_HOST` back into the environment, because the Admin SDK offers no option for it and reads that variable itself.

class-validator earns its place on request DTOs instead, where the global `ValidationPipe` uses it — see `src/auth/dto/`.

## Commands

```bash
pnpm build        # compile to dist/
pnpm start:prod   # run the compiled build
pnpm lint         # lint (lint:fix to autofix)
pnpm typecheck    # type-check without emitting
```

There is no formatter. ESLint covers correctness, `.editorconfig` covers indentation and line endings, and line length is left to judgement.

## License

[MIT](../LICENSE) © Dat Nguyen
