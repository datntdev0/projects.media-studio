"""FastAPI wrapper around the Scrapling stealth browser."""

import logging
from contextlib import asynccontextmanager
from types import ModuleType

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Response

from . import config  # noqa: F401  (loaded first: sets HF_HOME before vieneu is imported)
from . import images, logs
from .browser import browser
from .models import Chapter, ChapterContent, FetchOptions, Health, Novel, SpeechJob, SpeechRequest
from .parsers import CRAWLERS
from .speech import start_speech_generation
from .tts import tts_engine

logs.configure()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Warm the browser up front so the first caller does not pay for the Cloudflare solve.
    try:
        await browser.start()
    except Exception:
        logger.warning("browser failed to warm up, will retry on first request", exc_info=True)
    try:
        await tts_engine.load()
    except Exception:
        logger.warning("TTS model failed to load, will retry on first request", exc_info=True)
    yield
    await browser.close()


app = FastAPI(
    title="media-studio scraping",
    description="Scrapes novel metadata, chapter lists and covers from the supported sites.",
    version="2.0.0",
    lifespan=lifespan,
)

DEFAULTS = FetchOptions()

# A chapter runs over one or two pages. Ten is a stop against a link that circles back,
# not a judgement about how long a chapter may be.
MAX_CHAPTER_PARTS = 10

CrawlerName = Path(description="Which crawler to use, as listed by /crawlers")
SourceUrl = Query(..., alias="sourceUrl", description="The book's URL on the source site")
ChapterUrl = Query(..., alias="sourceUrl", description="One chapter's own URL, as /chapters listed it")


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


def resolve_chapter(module: ModuleType, source_url: str) -> str:
    """The same, for a chapter URL — which has no book id to derive."""
    try:
        return module.resolve_chapter(source_url)
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


@app.get("/novels/{crawler}/content", response_model=ChapterContent)
async def get_content(
    crawler: str = CrawlerName,
    source_url: str = ChapterUrl,
    options: FetchOptions = Depends(fetch_options),
) -> ChapterContent:
    """The text of one chapter. `sourceUrl` is a chapter URL here, not a book URL.

    A long chapter is served over several pages, so the parts are followed while the
    page links to the next one and the whole chapter comes back as one answer. The cap
    is a stop against a site that links in a circle, not a real limit.
    """
    module = get_crawler(crawler)
    chapter_url = resolve_chapter(module, source_url)

    title, lines = "", []
    for _ in range(MAX_CHAPTER_PARTS):
        page = await fetch_page(chapter_url, options)
        part = module.parse_content(page)

        title = title or part["title"]
        lines.extend(part["content"])

        next_url = module.next_part_url(page, chapter_url)
        if not next_url:
            break
        chapter_url = next_url
    else:
        logger.warning("%s has more than %d parts; the rest is not read", source_url, MAX_CHAPTER_PARTS)

    return ChapterContent(title=title, content=lines)


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


@app.post("/speech", response_model=SpeechJob)
async def create_speech(request: SpeechRequest) -> SpeechJob:
    """Schedule `texts` to be synthesized as one line each, stitched into a wav with a matching
    srt, and return immediately with the job's id.

    Idempotent: a payload identical to an earlier call (same texts/voice/pace) reuses that
    call's files, or joins its run if still in flight, instead of resynthesizing.

    Asynchronous: a whole chapter can take many minutes on CPU, so this doesn't wait for
    synthesis — the caller polls the shared speech directory for `<id>.wav`/`<id>.srt` (done)
    or `<id>.error` (failed), resolved against its own copy of the shared app data dir.
    """
    return SpeechJob(id=await start_speech_generation(request))
