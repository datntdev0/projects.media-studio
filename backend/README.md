# @media-studio/backend

The Media Studio API — a [NestJS](https://nestjs.com) service that exposes the media generation pipelines to the frontend.

Part of the [projects.media-studio](../README.md) monorepo. Install dependencies from the repository root, not from this directory.

## Development

```bash
# from the repository root
pnpm dev:backend

# or from this directory
pnpm dev
```

The server listens on `http://localhost:3001` by default (override with `PORT`).

## Routes

| Route | Purpose |
| --- | --- |
| `/api/v1/system` | Service name, build and the API version serving the response |
| `/health` | Liveness. Unversioned on purpose — see below |
| `/docs` | Swagger UI |
| `/openapi.json` | The generated OpenAPI document |

The API is prefixed and versioned: `/api/v1/…`, from `setGlobalPrefix` plus URI versioning in `src/core/configure-app.ts`. Two things sit outside that space because neither belongs to a version of the API:

- **`/health`** — orchestrators, load balancers and the Playwright suite's readiness probe should not have to track which API version is current. The route opts out of the version with `VERSION_NEUTRAL` and out of the prefix through the `exclude` list.
- **the docs** — they describe every version rather than living inside one.

Every response carries an `x-request-id`, echoing the inbound one if there was one. Failures answer in a single shape (`statusCode`, `message`, `error`, `requestId`, `path`, `timestamp`), so the id in a bug report is enough to find the request in the logs.

## Architecture

Three layers, dependencies pointing one way only: **controller → manager → repository**.

| Layer | Owns | May depend on | Must not |
| --- | --- | --- | --- |
| Controller | HTTP: routes, DTO validation, status codes, OpenAPI decorators | its own module's manager | hold business rules, or touch a repository |
| Manager | Use cases and business rules | repositories, other modules' exported managers | see `Request`/`Response`, or build queries |
| Repository | Persistence for one aggregate | its data source | hold business rules, or return HTTP-shaped errors |

Managers stay framework-free — no decorator beyond `@Injectable()`, no HTTP types — which is what lets their specs run without a Nest fixture (see `src/system/system.manager.spec.ts`).

```
src/
  main.ts                  bootstrap only: logger, configureApp, docs, listen
  core/                    cross-cutting, imported once by AppModule
    api.constants.ts       the shape of the URL space
    configure-app.ts       prefix, versioning, pipe, interceptor, filter
    config/                environment schema and a typed reader
    logging/               logger, request context, request log line
    http/                  the global exception filter
    openapi/               document and Swagger UI
  system/                  one feature module: controllers, manager, dto
```

Modules are feature-first: a domain folder holds its own controller, manager and repository. Layer-first folders (`controllers/`, `managers/`, …) read well at five files and badly at fifty, and stop matching Nest's module boundaries.

### Adding a domain

```ts
// library/library.repository.ts — the contract is the DI token
export abstract class NovelRepository {
  abstract findById(id: string): Promise<Novel | null>;
}

// library/library.module.ts
@Module({
  controllers: [LibraryController],
  providers: [
    LibraryManager,
    { provide: NovelRepository, useClass: InMemoryNovelRepository },
  ],
  exports: [LibraryManager], // never the repository
})
export class LibraryModule {}
```

Declare every seam that will have more than one implementation as an `abstract class`, used as both the type and the DI token: the compiler checks the shape, and a spec swaps it with `.overrideProvider(NovelRepository).useValue(stub)`. Concrete providers are injected by class — no string tokens.

A module exports managers, never repositories: persistence stays private to the domain that owns it. There is deliberately no generic base repository; each aggregate declares the methods it actually needs.

Storage is not chosen yet, so repositories are in-memory when the first domain lands.

## Configuration

Every variable is documented in [`.env.example`](.env.example) and validated at boot by `src/core/config/env.validation.ts` — a bad value refuses to start the process rather than failing on the first request, and every offending variable is reported at once. `.env.local` is read before `.env`; neither is committed.

Providers read settings through `AppConfigService`, so `process.env` is interpreted in exactly one file.

## Commands

```bash
pnpm build          # compile to dist/
pnpm start:prod     # run the compiled build
pnpm test           # unit tests
pnpm test:e2e       # supertest end-to-end tests
pnpm test:coverage  # coverage report
pnpm lint           # lint (use lint:fix to autofix)
pnpm typecheck      # type-check without emitting
pnpm format         # format with Prettier
```

## License

[MIT](../LICENSE) © Dat Nguyen
