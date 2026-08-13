"""FastAPI wrapper around the Scrapling stealth browser."""

import logging
from contextlib import asynccontextmanager
from types import ModuleType

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Response

from . import images, logs
from .browser import browser
from .models import Chapter, FetchOptions, Health, Novel
from .parsers import CRAWLERS

logs.configure()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Warm the browser up front so the first caller does not pay for the Cloudflare solve.
    try:
        await browser.start()
    except Exception:
        logger.warning("browser failed to warm up, will retry on first request", exc_info=True)
    yield
    await browser.close()


app = FastAPI(
    title="media-studio scraping",
    description="Scrapes novel metadata, chapter lists and covers from the supported sites.",
    version="2.0.0",
    lifespan=lifespan,
)

DEFAULTS = FetchOptions()

CrawlerName = Path(description="Which crawler to use, as listed by /crawlers")
SourceUrl = Query(..., alias="sourceUrl", description="The book's URL on the source site")


def fetch_options(
    headless: bool = Query(DEFAULTS.headless, description="Hide the browser. Runs a one-off browser, and Cloudflare rarely clears this way"),
    solve: bool = Query(DEFAULTS.solve, description="Solve the Cloudflare challenge"),
    timeout: int = Query(DEFAULTS.timeout, ge=1, le=600, description="Per-operation timeout in seconds"),
) -> FetchOptions:
    """The per-request browser overrides every scraping endpoint accepts."""
    return FetchOptions(headless=headless, solve=solve, timeout=timeout)


def get_crawler(crawler: str) -> ModuleType:
    module = CRAWLERS.get(crawler)
    if module is None:
        known = ", ".join(sorted(CRAWLERS))
        raise HTTPException(status_code=404, detail=f"Unknown crawler '{crawler}'. Available: {known}")
    return module


def resolve_book(module: ModuleType, source_url: str) -> tuple[str, str]:
    """Resolve the source URL, rejecting one that does not belong to this crawler."""
    try:
        return module.resolve(source_url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


async def fetch_page(url: str, options: FetchOptions):
    try:
        response = await browser.fetch(url, options)
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Fetching {url} failed: {error}") from error
    if response.status == 404:
        raise HTTPException(status_code=404, detail=f"{url} does not exist")
    if response.status != 200:
        raise HTTPException(status_code=502, detail=f"{url} returned HTTP {response.status}")
    return response


@app.get("/health", response_model=Health)
async def health() -> Health:
    stats = browser.pool_stats() or {}
    return Health(status="ok", browser_running=browser.running, pages_in_use=stats.get("busy"))


@app.get("/crawlers", response_model=dict[str, str])
async def list_crawlers() -> dict[str, str]:
    """The available crawlers and the site each one handles."""
    return {name: module.BASE_URL for name, module in sorted(CRAWLERS.items())}


@app.get("/novels/{crawler}/metadata", response_model=Novel, response_model_exclude_none=True)
async def get_metadata(
    crawler: str = CrawlerName,
    source_url: str = SourceUrl,
    options: FetchOptions = Depends(fetch_options),
) -> Novel:
    """The book's metadata, without its chapter list."""
    module = get_crawler(crawler)
    book_url, book_id = resolve_book(module, source_url)

    page = await fetch_page(book_url, options)
    return Novel(crawler=crawler, **module.parse_metadata(page, book_url, book_id))


@app.get("/novels/{crawler}/chapters", response_model=list[Chapter])
async def get_chapters(
    crawler: str = CrawlerName,
    source_url: str = SourceUrl,
    options: FetchOptions = Depends(fetch_options),
) -> list[Chapter]:
    """The full chapter list, in reading order."""
    module = get_crawler(crawler)
    book_url, book_id = resolve_book(module, source_url)

    page = await fetch_page(module.chapters_url(book_url), options)
    return [Chapter(**chapter) for chapter in module.parse_chapters(page, book_id)]


@app.get("/novels/{crawler}/cover", responses={200: {"content": {"image/jpeg": {}}}})
async def get_cover(
    crawler: str = CrawlerName,
    source_url: str = SourceUrl,
    options: FetchOptions = Depends(fetch_options),
) -> Response:
    """The cover image bytes. Image CDNs sit behind the same protection, so this goes through the browser too."""
    module = get_crawler(crawler)
    book_url, book_id = resolve_book(module, source_url)

    page = await fetch_page(book_url, options)
    cover_url = module.parse_metadata(page, book_url, book_id).get("cover_url")
    if not cover_url:
        raise HTTPException(status_code=404, detail="This book has no cover image")

    response = await fetch_page(cover_url, options)
    body = response.body if isinstance(response.body, bytes) else bytes(response.body or b"")
    media_type = images.media_type(body)
    if not media_type:
        raise HTTPException(status_code=502, detail="The cover URL did not return an image")

    return Response(content=body, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})
