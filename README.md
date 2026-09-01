# Media Studio

An Electron desktop app for managing a personal media library — novels, images, and videos.
It lets you edit and translate text chapters and tracks download progress. Content comes in
either by hand or by importing a `.zip` library package, which a separate Python **scrape
script** produces from a source site (via a stealth browser, since Cloudflare-protected sites
need a real browser, not a plain HTTP client).

## Architecture

The app is split into three processes plus a shared layer:

- **`src/main`** — Electron main process (Node). Owns the SQLite database, the IPC handlers,
  and the library package reader/writer.
- **`src/preload`** — bridges main → renderer via `contextBridge.exposeInMainWorld`.
- **`src/renderer`** — React 19 UI, talking to main only through `window.<x>Api`.
- **`src/shared`** — types, IPC channel constants, and API interfaces shared across processes.
- **`src/scripts`** — the Python side, entirely separate from the Electron app: `scrape.py`
  plus the `scraping/` package it drives (the crawlers and the stealth browser). Run on
  demand; nothing in the app talks to it, they meet only through the `.zip` it writes.

## Library packages

Export and import move a library item between workspaces as `library.<name>.zip`:

```
library.<name>.zip
├── library.json        the manifest: item metadata and the chapter index
├── cover.jpg           the cover image, when the item has one
└── chapters/
    ├── chapter-0001.txt
    └── chapter-0002.txt
```

Export lives on the library list's row menu; import is the "From a .zip" option in the
new-item dialog. `src/scripts/scrape.py` writes the same format, so a scrape drops straight in.

## Prerequisites

- Node.js (see `package.json` for tooling versions) and npm
- Python 3, with a virtual environment at `src/scripts/.venv` for the scraper:

  ```bash
  python -m venv src/scripts/.venv
  src/scripts/.venv/Scripts/pip install -r src/scripts/requirements.txt
  ```

## Getting started

Install dependencies:

```bash
npm install
```

Run the Electron app in dev mode (Forge + Vite, with HMR):

```bash
npm start
```

Scrape a novel into an importable package:

```bash
npm run scrape -- --crawler novel543 \
  --source-url https://www.novel543.com/0413553971 \
  --range 1-50 --workers 4 --output ./data
```

`--range` takes `all`, `1,3,5` or `23-34`; `--scheduled` defers the start to a local ISO-8601
time. Every chapter the source lists is recorded, and those the range names carry their text.

## Scripts

| Script | Description |
| --- | --- |
| `npm start` | Run the Electron app in dev mode |
| `npm run scrape` | Scrape a novel into a library package |
| `npm run typecheck` | Type-check the project with `tsc -b` |
| `npm test` | Run the unit tests |
| `npm run package` | Package the app via Electron Forge |
| `npm run make` | Build distributables via Electron Forge |

## License

Licensed under the [MIT License](./LICENSE).
