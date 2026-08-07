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

The server listens on `http://localhost:3001` by default (override with the `PORT` environment variable).

## Commands

```bash
pnpm build        # compile to dist/
pnpm start:prod   # run the compiled build
pnpm test         # unit tests
pnpm test:e2e     # end-to-end tests
pnpm test:cov     # coverage report
pnpm lint         # lint (use lint:fix to autofix)
pnpm typecheck    # type-check without emitting
pnpm format       # format with Prettier
```

## License

[MIT](../LICENSE) © Dat Nguyen
