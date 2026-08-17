# @media-studio/backend

The Media Studio API — a [NestJS](https://nestjs.com) service that exposes the media generation pipelines to the frontend.

Part of the [projects.media-studio](../README.md) monorepo. Install from the repository root, not from here, and follow [Getting started](../README.md#getting-started) — the service needs the Firebase emulators, Redis and a `.env` before it will boot.

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
| `GET POST /api/v1/library` | The catalogue: list with filters and paging, create an item |
| `GET PUT DELETE /api/v1/library/:id` | One item |
| `GET POST /api/v1/library/:id/contents` | What an item holds — chapters, images, clips |
| `GET PUT DELETE /api/v1/library/:id/contents/:contentId` | One of them, in the original or a translation |
| `POST /api/v1/scrapings/validate` | Read a source, and answer with what the preview screen draws |
| `POST /api/v1/scrapings/discover` | Read an item's source, and append the content it turns out to hold |
| `GET POST /api/v1/scrapings/jobs` | Download jobs: one page of them, or record one and publish it now or later |
| `PATCH /api/v1/scrapings/jobs/:id/status` | Start, pause, resume or cancel a job |
| `DELETE /api/v1/scrapings/jobs/:id` | Delete a settled job, and its tasks with it |
| `GET /system` | Service name, build, environment, default API version |
| `GET /health` | Liveness |
| `/docs` | Swagger UI |
| `/openapi.json` | The generated OpenAPI document |

Two tiers, wired in `src/core/configure-app.ts` and named in `src/core/api.constants.ts`:

- **`/api/v1/…`** — the API proper. Anything whose payload can change between versions lives here and gets `/v1` by default.
- **`/system`, `/health`, `/docs`, `/openapi.json`** — outside the prefix and the version. What the service is and whether it is alive are not per-version questions, and the docs describe every version rather than living inside one.

Every response carries an `x-request-id`, echoing the inbound one if there was one. Failures answer in a single shape (`statusCode`, `message`, `error`, `requestId`, `path`, `timestamp`), so the id in a bug report is enough to find the request in the logs.

The frontend reaches all of this through a client generated from `/openapi.json`. Change a DTO or a route and that client is stale — see [the frontend README](../frontend/README.md#the-generated-api-client).

## Authentication

There is no sign-in endpoint. The browser exchanges credentials with Firebase Authentication directly, so no password reaches this service; both `auth/` routes sit behind `FirebaseAuthGuard`, which verifies the bearer ID token with the Admin SDK and hands the decoded claims to the handler through `@CurrentUser()`. Expired, malformed and forged tokens all answer `401` — which of them it was goes to the log.

Changing a password is the one exception to "the Admin SDK is enough": it can set a password but cannot check one, so `IdentityToolkitClient` proves the current password over the same REST API the browser uses before `updateUser` runs. Without that, a stolen token would be enough to lock an account's owner out.

Locally this runs against the [Auth emulator](https://firebase.google.com/docs/emulator-suite) — `FIREBASE_EMULATOR_AUTHENTICATION_HOST` makes the Admin SDK skip the signature check and use no credential at all, so the guard is only as good as the emulator is private.

## Architecture

Three layers, dependencies pointing one way: **controller → manager → repository**.

| Layer | Owns | May depend on | Must not |
| --- | --- | --- | --- |
| Controller | Routes, DTO validation, status codes, OpenAPI decorators | its own module's managers | hold business rules, or touch a repository |
| Manager | Use cases and business rules | repositories, other modules' exported managers | see `Request`/`Response`, or build queries |
| Repository | Persistence for one aggregate | Firestore | hold business rules, or return HTTP-shaped errors |

Managers stay framework-free — no decorator beyond `@Injectable()`, no HTTP types — so they can be constructed directly, without a Nest fixture.

```
src/
  main.ts                  bootstrap only: logger, configureApp, docs, listen
  app.module.ts            composition root: core, then one import per feature
  _shared/                 helpers with no domain of their own
  core/                    cross-cutting, imported once by AppModule and global
    api.constants.ts       the shape of the URL space
    configure-app.ts       prefix, versioning, pipe, interceptor, filter
    service-metadata.ts    name and version, read from package.json
    config/                environment reader and its typed accessor
    logging/               logger, request context, request log line
    http/                  the global exception filter
    firebase/              the Admin SDK app, the collection names, the repository base
    openapi/               document and Swagger UI
    providers/             cache, scraping service, content files, realtime status
    queues/                topics, the producer, the consumer base class
  auth/                    controller over manager, guard, token verification
  library/                 one controller over three managers over three repositories
  scraping/                controller, job manager, scheduler, and two queue consumers
  system/                  two controllers over one manager and one repository
```

Modules are feature-first: a domain folder holds its own controller, managers, repositories, `dto/` and `entities/`. A DTO is the wire contract; an entity is the stored shape. They are separate on purpose — the JSON a client sees is free to change without moving a document, and the other way round.

### Adding a domain

`auth/` is the shape to copy for a controller over a manager alone; `library/` is the shape once persistence is involved. A repository extends `FirestoreRepository`, which owns the two things that would otherwise be rewritten per collection — the collection reference, and turning a snapshot into an entity with its `Timestamp` fields flattened to ISO strings:

```ts
// library/library.repository.ts
@Injectable()
export class LibraryRepository extends FirestoreRepository<LibraryItem> {
  protected readonly collectionName = LIBRARY_COLLECTION;
}

// library/library.module.ts
@Module({
  controllers: [LibraryController],
  providers: [LibraryManager, LibraryRepository],
  exports: [LibraryManager], // never the repository
})
export class LibraryModule {}
```

A module exports managers, never repositories — what collection anything lives in stays private to the domain that owns it, which is how `scraping/` writes chapters through `LibraryContentManager` without knowing where they land. Collection names live together in `core/firebase/collections.ts`: a name that appears in two files is a name that eventually disagrees with itself.

There is no generic query on the base class. Each repository writes the queries its own domain needs, in its own terms, rather than inheriting a `find(criteria)` general enough for everything and honest about nothing.

## Configuration

Every variable is documented in [`.env.example`](.env.example) and lifted into a typed object by `src/core/config/configuration.ts`, which reads and defaults but does not validate: an unusable value falls back to its default rather than stopping the process. `.env.local` is read before `.env`; neither is committed.

Providers read settings through `AppConfigService`, so `process.env` is interpreted in exactly one file. The single exception writes rather than reads: `FirebaseAdminService` copies the four `FIREBASE_EMULATOR_*_HOST` settings into the variables the Admin SDK reads itself, because it offers no option for any of them. All four together are also what stand in for a credential — leave one out and the service assumes something points at the real Firebase and asks for a service account.

class-validator earns its place on request DTOs instead, where the global `ValidationPipe` uses it — see `src/auth/dto/`.

## Queues

BullMQ over Redis, started by `pnpm dev:infrastructure`. Work that outlives the request goes on a queue: a manager sends a topic and returns, and every consumer of that topic runs afterwards on its own.

The pattern is one producer, many consumers. BullMQ hands a job to exactly one worker, so a topic two parts must both see needs a queue each — `QueueProducer` adds the same message to every queue listed for the topic, and each consumer then succeeds, retries and fails on its own without touching the others.

`src/core/queues/` holds all three pieces: `queue.messages.ts` (the topics, their payloads, and `QUEUE_CONSUMERS` — the one place fan-out is configured), `queue.producer.ts`, and `queue.consumer.ts`. Every queue named in the registry is registered once by `CoreModule`, which is global, so a feature module only declares the consumer class.

Producing, from any manager:

```ts
constructor(private readonly producer: QueueProducer) {}

await this.producer.send(QueueTopic.ScrapingContentRequested, { jobId, itemId, contentId, crawler, sourceUrl, refetch, retry });
```

Consuming — add the queue name to `QUEUE_CONSUMERS[topic]`, then declare the class in the module that owns the work:

```ts
@Processor(SCRAPING_CONTENT_QUEUE, { concurrency: 2 })
export class ScrapingContentConsumer extends QueueConsumer<ScrapingContentRequested> {
  protected handle(message: QueueMessage<ScrapingContentRequested>): Promise<void> { … }
}
```

Throwing out of `handle` is how a consumer says the work did not happen: BullMQ retries on the `QUEUE_ATTEMPTS`/`QUEUE_BACKOFF_MS` schedule and, once the attempts are spent, leaves the job in the failed set. Swallowing would mark it done.

`scraping/scraping-content.handler.ts` is the worked example — one chapter per message, sent in bulk by `ScrapingJobManager`.

## Tests

Specs sit beside what they test as `*.spec.ts`, run by Jest. Managers are the layer worth testing: framework-free, so a spec constructs one with stub repositories and needs no Nest fixture.

```bash
pnpm test                  # every spec
pnpm test:watch            # watch mode
pnpm test:cov              # with coverage, into coverage/
pnpm test -- library.manager   # one file, by pattern
```

`pnpm test:cov` writes a browsable report to `coverage/index.html`, plus the `coverage-summary.json` and `test-results.json` that [`scripts/report-coverage.mjs`](../scripts/report-coverage.mjs) renders into the GitHub Actions job summary. Coverage counts every file under `src/`, modules and DTOs included, so the headline number reads lower than the tested code deserves.

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
