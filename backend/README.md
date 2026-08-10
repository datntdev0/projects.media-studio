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
| `POST /api/v1/auth/login` | Exchange credentials for an access token (**mock**) |
| `POST /api/v1/auth/register` | Create an account and sign in (**mock**) |
| `GET /api/v1/auth/me` | The user an access token belongs to (**mock**) |
| `GET /system` | Service name, build, environment, default API version |
| `GET /health` | Liveness |
| `/docs` | Swagger UI |
| `/openapi.json` | The generated OpenAPI document |

Two tiers, wired in `src/core/configure-app.ts` and named in `src/core/api.constants.ts`:

- **`/api/v1/…`** — the API proper. Anything whose payload can change between versions lives here and gets `/v1` by default.
- **`/system`, `/health`, `/docs`, `/openapi.json`** — outside the prefix and the version. What the service is and whether it is alive are not per-version questions, and the docs describe every version rather than living inside one.

Every response carries an `x-request-id`, echoing the inbound one if there was one. Failures answer in a single shape (`statusCode`, `message`, `error`, `requestId`, `path`, `timestamp`), so the id in a bug report is enough to find the request in the logs.

## Architecture

Three layers, dependencies pointing one way: **controller → manager → repository**.

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
    openapi/               document and Swagger UI
  auth/                    all three layers — the worked example
  system/                  two controllers over one manager, no repository
```

Modules are feature-first: a domain folder holds its own controller, manager and repository.

### Adding a domain

`auth/` is the pattern to copy. The repository is an `abstract class`, serving as both the type the manager is checked against and the token Nest resolves:

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

A module exports managers, never repositories — persistence stays private to the domain that owns it. There is no generic base repository: each aggregate declares the methods it actually needs.

Storage is not chosen yet, so `InMemoryUserRepository` stands in. Replacing it is one line, with nothing to change in the manager or the controller.

### ⚠️ The auth module is a mock

`auth/` compares passwords in plain text and issues an unsigned token that is just the user's id, so anyone can mint one. It exists to give the frontend endpoints to build against and to make the layering concrete. Before it is reachable outside development, replace the credential check with a password hash (argon2/bcrypt) and the token with a signed JWT or a server-side session. The seeded account is `dat@media.studio` / `password`.

## Configuration

Every variable is documented in [`.env.example`](.env.example) and lifted into a typed object by `src/core/config/configuration.ts`, which reads and defaults but does not validate: an unusable value falls back to its default rather than stopping the process. `.env.local` is read before `.env`; neither is committed.

Providers read settings through `AppConfigService`, so `process.env` is interpreted in exactly one file. class-validator earns its place on request DTOs instead, where the global `ValidationPipe` uses it — see `src/auth/dto/`.

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
