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
| `POST /api/v1/auth/login` | Exchange credentials for an access token (**mock**) |
| `POST /api/v1/auth/register` | Create an account and sign in (**mock**) |
| `GET /api/v1/auth/me` | The user an access token belongs to (**mock**) |
| `GET /api/system` | Service name, build, and the API version versioned routes default to |
| `GET /health` | Liveness |
| `/docs` | Swagger UI |
| `/openapi.json` | The generated OpenAPI document |

Three tiers, set up in `src/core/configure-app.ts` and named in `src/core/api.constants.ts`:

- **`/api/v1/…`** — the API proper. Anything whose payload can change between versions lives here and gets the version by default.
- **`/api/system`** — prefixed but `VERSION_NEUTRAL`. Which build is running is not a per-version question, so a client should not have to choose a version to ask.
- **`/health`, `/docs`, `/openapi.json`** — outside the prefix. Liveness is for orchestrators, load balancers and the Playwright readiness probe, none of which should track API versions; the docs describe every version rather than living inside one.

Every response carries an `x-request-id`, echoing the inbound one if there was one. Failures answer in a single shape (`statusCode`, `message`, `error`, `requestId`, `path`, `timestamp`), so the id in a bug report is enough to find the request in the logs.

## Architecture

Three layers, dependencies pointing one way only: **controller → manager → repository**.

| Layer | Owns | May depend on | Must not |
| --- | --- | --- | --- |
| Controller | HTTP: routes, DTO validation, status codes, OpenAPI decorators | its own module's manager | hold business rules, or touch a repository |
| Manager | Use cases and business rules | repositories, other modules' exported managers | see `Request`/`Response`, or build queries |
| Repository | Persistence for one aggregate | its data source | hold business rules, or return HTTP-shaped errors |

Managers stay framework-free — no decorator beyond `@Injectable()`, no HTTP types — which is what lets their specs run without a Nest fixture (see `src/auth/auth.manager.spec.ts`).

```
src/
  main.ts                    bootstrap only: logger, configureApp, docs, listen
  core/                      cross-cutting, imported once by AppModule
    api.constants.ts         the shape of the URL space
    configure-app.ts         prefix, versioning, pipe, interceptor, filter
    config/                  environment reader and its typed accessor
    logging/                 logger, request context, request log line
    http/                    the global exception filter
    openapi/                 document and Swagger UI
  auth/                      all three layers — the worked example
    auth.controller.ts       HTTP, DTOs, OpenAPI
    auth.manager.ts          the rules (mock)
    user.repository.ts       the contract, and the DI token for it
    in-memory-user.repository.ts   today's implementation
  system/                    controllers + manager, no repository
```

Modules are feature-first: a domain folder holds its own controller, manager and repository. Layer-first folders (`controllers/`, `managers/`, …) read well at five files and badly at fifty, and stop matching Nest's module boundaries.

### Adding a domain

`auth/` is the pattern to copy. The repository is an `abstract class`, used as both the type the manager is checked against and the token Nest resolves:

```ts
// auth/user.repository.ts
export abstract class UserRepository {
  abstract findByEmail(email: string): Promise<User | null>;
}

// auth/auth.module.ts — the only line that knows what backs it
@Module({
  controllers: [AuthController],
  providers: [
    AuthManager,
    { provide: UserRepository, useClass: InMemoryUserRepository },
  ],
  exports: [AuthManager], // never the repository
})
export class AuthModule {}
```

A spec swaps it with `.overrideProvider(UserRepository).useValue(stub)`; concrete providers are injected by class, with no string tokens. A module exports managers, never repositories — persistence stays private to the domain that owns it. There is deliberately no generic base repository: each aggregate declares the methods it actually needs.

Storage is not chosen yet, so `InMemoryUserRepository` stands in. Replacing it is one line here, with nothing to change in the manager or the controller.

### The mock auth module

⚠️ `auth/` is a **placeholder**. It compares passwords in plain text and issues an unsigned token that is simply the user's id, so anyone can mint one. It exists to give the frontend endpoints to build against and to make the layering concrete. Before it is reachable by anyone outside development, replace the credential check with a password hash (argon2/bcrypt) and the token with a signed JWT or a server-side session. The seeded account is `dat@media.studio` / `password`.

## Configuration

Every variable is documented in [`.env.example`](.env.example) and lifted into a typed object by `src/core/config/configuration.ts`, which reads and defaults but does not validate: an unusable value falls back to its default rather than stopping the process. `.env.local` is read before `.env`; neither is committed.

Providers read settings through `AppConfigService`, so `process.env` is interpreted in exactly one file.

class-validator earns its place on request DTOs instead, where the global `ValidationPipe` uses it — see `src/auth/dto/`.

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
