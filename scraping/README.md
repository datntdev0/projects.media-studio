# @media-studio/scraping

FastAPI service wrapping [Scrapling](https://github.com/D4Vinci/Scrapling). It scrapes novel metadata, chapter lists and cover images from [novel543.com](https://www.novel543.com), which sits behind Cloudflare.

## Running it

With the rest of the local infrastructure, from the repository root:

```bash
pnpm dev:infrastructure  # the emulators and this service
```

Or just this service:

```bash
docker compose -f _deploy/dockercompose.local.infrastructure.yml up --build scraping
```

The API is published on `127.0.0.1:8000`, with interactive docs at <http://127.0.0.1:8000/docs>.

Standalone Docker:

```bash
docker build -t media-studio-scraping ./scraping
docker run --rm -p 8000:8000 --shm-size 1g media-studio-scraping
```

Locally, without Docker (needs a desktop session — see the note about the visible browser):

```bash
cd scraping
py -3.11 -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/scrapling.exe install    # one-off: fetches the browsers
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness plus whether the browser is up |
| `GET` | `/crawlers` | The available crawlers and the site each one handles |
| `GET` | `/novels/{crawler}/metadata` | Book metadata |
| `GET` | `/novels/{crawler}/chapters` | The full chapter list, in reading order |
| `GET` | `/novels/{crawler}/cover` | Cover image bytes, content type from the file signature |

The three scraping endpoints take the same shape: the crawler in the path, the book as `sourceUrl`.

```bash
curl "http://127.0.0.1:8000/novels/novel543/metadata?sourceUrl=https://www.novel543.com/0413553971"
curl "http://127.0.0.1:8000/novels/novel543/chapters?sourceUrl=https://www.novel543.com/0413553971"
curl -o cover.jpg "http://127.0.0.1:8000/novels/novel543/cover?sourceUrl=https://www.novel543.com/0413553971"
```

`sourceUrl` also accepts a bare book id. Each crawler checks the URL is its own, so an unknown crawler gives `404` (listing the ones that exist) and a URL from another site gives `400`.

### Per-request overrides

All three scraping endpoints accept the same optional query parameters.

| Parameter | Default | Effect |
| --- | --- | --- |
| `headless` | `false` | Hide the browser. Cloudflare rarely clears this way |
| `solve` | `true` | Solve the Cloudflare challenge |
| `timeout` | `120` | Per-operation timeout in seconds, between `1` and `600` |

These defaults live on `FetchOptions` in `app/models.py`. They are the service-wide defaults: the shared browser is launched from them too, so changing one there moves both the endpoint default and how the browser starts.

```bash
curl "http://127.0.0.1:8000/novels/novel543/chapters?sourceUrl=0413553971&solve=false&timeout=30"
```

`solve` and `timeout` apply per fetch, so they run on the warm shared browser. `headless` cannot: it is fixed when a browser launches, so passing a non-default value starts a one-off browser for that request and closes it afterwards. That one-off gets a throwaway profile — the shared browser holds the persisted one open and Chromium will not run two instances against the same profile — so it always pays for the Cloudflare challenge and is markedly slower.

`/metadata` returns the book fields; omitted ones are left out rather than sent as null.

```json
{
  "id": "0413553971",
  "url": "https://www.novel543.com/0413553971",
  "crawler": "novel543",
  "title": "…",
  "author": "…",
  "category": "武俠",
  "status": "連載",
  "updatedAt": "2026-08-13 00:33:11",
  "latestChapter": "…",
  "coverUrl": "https://i2.novel543.com/…jpg"
}
```

`/chapters` returns the list on its own:

```json
[{ "index": 1, "title": "…", "url": "https://www.novel543.com/0413553971/8095_1.html" }]
```

Responses are camelCase. A missing book gives `404`; an upstream or browser failure gives `502`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | Port uvicorn listens on |
| `SCRAPER_MAX_PAGES` | `4` | Browser tabs, which also caps concurrent scrapes |
| `SCRAPER_IDLE_RESTART_SECONDS` | `900` | Rebuild the browser after this much idle time |
| `SCRAPER_USER_DATA_DIR` | `/data/profile` | Persisted browser profile. Empty means a throwaway one |

## How it works

- **The browser must be visible.** novel543 serves a non-interactive Cloudflare turnstile. Headed it clears in a few seconds; headless the solver loops on "Waiting for Cloudflare wait page to disappear" forever. There is no virtual-display mode in the library, so `entrypoint.sh` starts Xvfb itself and points `DISPLAY` at it. It does not use `xvfb-run`: as PID 1 that wrapper wedges before it ever launches the command, and swallows the logs with it.
- **Browser build.** Scrapling drives patchright, which pins a different Chromium build than the one baked into the Playwright base image, so the Dockerfile runs `patchright install chromium` on top of `scrapling install`.
- **One browser, reused.** `app/browser.py` keeps a single `AsyncStealthySession` alive for the whole process and warms it at startup, so Cloudflare is solved once instead of per request.
- **The profile is persisted** to `/data/profile` on a volume, which carries the Cloudflare clearance cookie across restarts. Measured on a book with 1305 chapters:

  | | First scrape after boot |
  | --- | --- |
  | Fresh profile, turnstile solved | ~18s |
  | Persisted profile reused, challenge skipped | ~4.5s |

  Later requests are about 3-4 seconds either way. Chromium refuses to open a profile that still looks busy, so `app/browser.py` clears the stale `Singleton*` locks a hard-killed container leaves behind — without that every launch after an unclean stop fails.
- **Concurrency** is bounded by `SCRAPER_MAX_PAGES` through a semaphore over the session's tab pool. Run a single uvicorn worker — each worker would otherwise launch its own browser.
- **Recovery.** If a fetch throws, the session is torn down and rebuilt once before the request fails. The session is also rebuilt after `SCRAPER_IDLE_RESTART_SECONDS` idle so a stale clearance cookie cannot wedge later requests.
- **Covers** go through the browser as well: the image CDN is Cloudflare-protected and returns 403 to a plain HTTP client.
- **Logging** goes through `app/logs.py`. Scrapling reports "No Cloudflare challenge found" at ERROR, but it only means the page had no challenge — the clearance cookie already covered it, or the site is not behind Cloudflare — so it is demoted to INFO. Scrapling also installs its own handler and propagates to the root logger, which would print each of its lines twice, so its handler is dropped and everything shares one format.
- **Chapters** come from `ul.all` on the `/dir` page. That page also has a short "latest chapters" block, so scanning every anchor would drag the newest chapters to the front and break the ordering.

## Layout

| File | Purpose |
| --- | --- |
| `app/main.py` | FastAPI routes, which stay site-agnostic |
| `app/browser.py` | The shared stealth browser session |
| `app/parser.novel543.py` | Everything specific to novel543 |
| `app/parsers.py` | The crawler registry |
| `app/images.py` | Image sniffing, shared by every crawler |
| `app/models.py` | Request and response models |
| `app/config.py` | Environment-backed settings |

### Adding a site

The routes know nothing about any particular site: they look the crawler up in the registry and call it. A crawler is one `parser.<name>.py` module exposing:

| Name | Purpose |
| --- | --- |
| `BASE_URL` | The site root, reported by `/crawlers` |
| `resolve(source)` | `(book_url, book_id)`, rejecting a URL that belongs to another site |
| `chapters_url(book_url)` | Where that site keeps the chapter list |
| `parse_metadata(page, book_url, book_id)` | A dict of `Novel` fields |
| `parse_chapters(page, book_id)` | A list of `{index, title, url}` |

Drop the module in and add its name to `CRAWLER_NAMES` in `app/parsers.py`; no route changes. Parser files follow the repository's `<kind>.<name>` naming, and a dot is not valid in a Python module name, so `parsers.py` loads them by path through `importlib` rather than a plain `import`.
