"""The scraping operations themselves, independent of how they are reached.

Both the HTTP service (app/main.py) and the standalone package script (scrape.py) work
through this module. Failures are raised in plain Python terms — `ValueError` for a URL
or crawler name that does not belong here, `PageError` for a page that could not be
read — leaving the API layer to translate them into responses and the script to print
them.
"""

import logging
from types import ModuleType
from urllib.parse import urlparse

from core import helpers
from core.options import FetchOptions

from .browser import browser
from .parsers import CRAWLERS

logger = logging.getLogger(__name__)

# A chapter runs over one or two pages. Ten is a stop against a link that circles back,
# not a judgement about how long a chapter may be.
MAX_CHAPTER_PARTS = 10

# What a crawler's site is taken to publish in when its parser module declares nothing.
FALLBACK_LANGUAGE = "en"


class PageError(RuntimeError):
    """A page that could not be fetched, or came back with a status that is not usable."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def find_crawler(source_url: str) -> ModuleType:
    """The crawler whose site `source_url` belongs to, matched on its host.

    A source URL already says which site it is, so the crawler is read off it rather
    than named separately — one less flag to get wrong.
    """
    host = (urlparse(source_url).hostname or "").lower()
    for module in CRAWLERS.values():
        if host in module.HOSTS:
            return module

    known = ", ".join(sorted(CRAWLERS))
    raise ValueError(f"No crawler handles {source_url!r}. Available: {known}")


def crawler_language(module: ModuleType) -> str:
    """The language the crawler's site publishes in, as its parser module declares it."""
    return getattr(module, "DEFAULT_LANGUAGE", FALLBACK_LANGUAGE)


async def fetch_page(url: str, options: FetchOptions):
    try:
        response = await browser.fetch(url, options)
    except Exception as error:
        raise PageError(f"Fetching {url} failed: {error}") from error

    if response.status == 404:
        raise PageError(f"{url} does not exist", status=404)
    if response.status != 200:
        raise PageError(f"{url} returned HTTP {response.status}", status=response.status)
    return response


async def read_metadata(module: ModuleType, source_url: str, options: FetchOptions) -> dict:
    """The book's metadata, without its chapter list."""
    book_url, book_id = module.resolve(source_url)
    page = await fetch_page(book_url, options)
    return module.parse_metadata(page, book_url, book_id)


async def read_chapters(module: ModuleType, source_url: str, options: FetchOptions) -> list[dict]:
    """The full chapter list, in reading order."""
    book_url, book_id = module.resolve(source_url)
    page = await fetch_page(module.chapters_url(book_url), options)
    return module.parse_chapters(page, book_id)


async def read_content(module: ModuleType, chapter_url: str, options: FetchOptions) -> dict:
    """The text of one chapter, as `{title, content}`.

    A long chapter is served over several pages, so the parts are followed while the page
    links to the next one and the whole chapter comes back as one answer. The cap is a stop
    against a site that links in a circle, not a real limit.
    """
    url = module.resolve_chapter(chapter_url)

    title, lines = "", []
    for _ in range(MAX_CHAPTER_PARTS):
        page = await fetch_page(url, options)
        part = module.parse_content(page)

        title = title or part["title"]
        lines.extend(part["content"])

        next_url = module.next_part_url(page, url)
        if not next_url:
            break
        url = next_url
    else:
        logger.warning("%s has more than %d parts; the rest is not read", chapter_url, MAX_CHAPTER_PARTS)

    return {"title": title, "content": lines}


async def read_cover_image(cover_url: str, options: FetchOptions) -> tuple[bytes, str] | None:
    """The cover's bytes and media type, or None when the URL did not return an image.

    Image CDNs sit behind the same protection as the pages, so this goes through the
    browser too rather than a plain HTTP request.
    """
    response = await fetch_page(cover_url, options)
    body = response.body if isinstance(response.body, bytes) else bytes(response.body or b"")

    media_type = helpers.media_type(body)
    return (body, media_type) if media_type else None
