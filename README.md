# Media Studio

An Electron desktop app for managing a personal media library — novels, images, and videos.
It scrapes source sites for content, lets you edit/translate text chapters, and tracks download
progress. A separate Python/FastAPI **worker** process does the actual web scraping (via a stealth
browser, since Cloudflare-protected sites need a real browser, not a plain HTTP client).

## Architecture

The app is split into three processes plus a shared layer:

- **`src/main`** — Electron main process (Node). Owns the SQLite database, IPC handlers, the
  scraping worker client, the in-process job queue, and scheduled jobs.
- **`src/preload`** — bridges main → renderer via `contextBridge.exposeInMainWorld`.
- **`src/renderer`** — React 19 UI, talking to main only through `window.<x>Api`.
- **`src/shared`** — types, IPC channel constants, and API interfaces shared across processes.
- **`src/worker`** — standalone Python FastAPI service that performs the actual scraping.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture notes and conventions.

## Prerequisites

- Node.js (see `package.json` for tooling versions) and npm
- Python 3 with a virtual environment for the worker (see `src/worker/requirements.txt`)

## Getting started

Install dependencies:

```bash
npm install
```

Run the Electron app in dev mode (Forge + Vite, with HMR):

```bash
npm start
```

Scraping features require the FastAPI worker running alongside the app:

```bash
npm run worker
```

This starts the worker at `127.0.0.1:8000` from `src/worker` (override with `SCRAPER_BASE_URL`).

## Scripts

| Script | Description |
| --- | --- |
| `npm start` | Run the Electron app in dev mode |
| `npm run worker` | Start the FastAPI scraping worker |
| `npm run typecheck` | Type-check the project with `tsc -b` |
| `npm run package` | Package the app via Electron Forge |
| `npm run make` | Build distributables via Electron Forge |

## License

Licensed under the [MIT License](./LICENSE).
