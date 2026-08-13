"""novel543.com: metadata from the og:* meta tags, chapters from the /dir page."""

import re
from urllib.parse import urljoin, urlparse

BASE_URL = "https://www.novel543.com"
HOSTS = {"novel543.com", "www.novel543.com"}

# meta name/property -> field on the Novel model
META_FIELDS = {
    "og:novel:book_name": "title",
    "og:novel:author": "author",
    "og:novel:category": "category",
    "og:novel:status": "status",
    "og:novel:update_time": "updated_at",
    "og:novel:latest_chapter_name": "latest_chapter",
    "og:novel:latest_chapter_url": "latest_chapter_url",
    "og:novel:read_url": "read_url",
    "og:image": "cover_url",
    "og:description": "description",
}

_BOOK_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def resolve(source: str) -> tuple[str, str]:
    """Turn a source URL (or a bare book id) into (book_url, book_id)."""
    source = (source or "").strip()
    if not source:
        raise ValueError("A source URL is required")

    parsed = urlparse(source)
    if parsed.scheme and parsed.netloc:
        if parsed.netloc.lower() not in HOSTS:
            raise ValueError(f"{parsed.netloc} is not a novel543 address")
        path = parsed.path
    else:
        path = source

    book_id = path.strip("/").split("/")[0]
    if not book_id or not _BOOK_ID.match(book_id):
        raise ValueError(f"Cannot work out a book id from {source!r}")
    return f"{BASE_URL}/{book_id}", book_id


def chapters_url(book_url: str) -> str:
    return f"{book_url}/dir"


def read_meta(page) -> dict[str, str]:
    """Collect every og:* meta tag; this site uses `name`, others use `property`."""
    found: dict[str, str] = {}
    for tag in page.css("meta"):
        key = tag.attrib.get("name") or tag.attrib.get("property")
        content = tag.attrib.get("content")
        if key and content and key.startswith("og:"):
            found[key.strip()] = content.strip()
    return found


def parse_metadata(page, book_url: str, book_id: str) -> dict:
    meta = read_meta(page)
    data: dict = {"id": book_id, "url": book_url}
    for meta_key, field in META_FIELDS.items():
        if meta.get(meta_key):
            data[field] = meta[meta_key]

    if not data.get("title"):
        heading = page.css("h1")
        data["title"] = heading[0].get_all_text(strip=True) if heading else None
    for field in ("cover_url", "latest_chapter_url", "read_url"):
        if data.get(field):
            data[field] = urljoin(book_url, data[field])
    return data


def parse_chapters(page, book_id: str) -> list[dict]:
    """Read the full chapter list.

    The directory page carries two lists: a short "latest chapters" block and
    `ul.all` with every chapter in ascending order. Only the latter is wanted,
    otherwise the newest chapters get pulled to the front of the result.
    """
    lists = page.css("ul.all") or page.css("ul")
    chapter_href = re.compile(rf"^/{re.escape(book_id)}/[^/]+\.html$")

    best: list = []
    for ul in lists:
        links = [a for a in ul.css("a") if chapter_href.match(a.attrib.get("href", ""))]
        if len(links) > len(best):
            best = links

    chapters, seen = [], set()
    for link in best:
        href = link.attrib.get("href", "")
        title = link.get_all_text(strip=True)
        if not title or href in seen:
            continue
        seen.add(href)
        chapters.append({"index": len(chapters) + 1, "title": title, "url": urljoin(BASE_URL, href)})
    return chapters
