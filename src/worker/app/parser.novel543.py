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

# What the site appends to a split chapter's heading: `(1/2)`, in either width of
# bracket. Anchored, because a heading may legitimately end in a bracketed number.
_PART_MARKER = re.compile(r"[（(]\s*\d+\s*/\s*\d+\s*[）)]$")


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


def resolve_chapter(source: str) -> str:
    """Turn a chapter URL (or a site-relative path) into an absolute one.

    A chapter is not a book: it has no id of its own worth deriving, so this only
    checks the URL belongs to the site and hands it back whole.
    """
    source = (source or "").strip()
    if not source:
        raise ValueError("A chapter URL is required")

    parsed = urlparse(source)
    if parsed.scheme and parsed.netloc:
        if parsed.netloc.lower() not in HOSTS:
            raise ValueError(f"{parsed.netloc} is not a novel543 address")
        return source
    return urljoin(BASE_URL, source)


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


def is_prose(text: str) -> bool:
    """Whether a line is worth keeping.

    Two rules, and both are about lines the page draws that a reader would not call
    text: one that is empty or only whitespace, and one made only of punctuation —
    `……` or `***`, a separator drawn as characters. `\\w` is Unicode-aware, so a line
    of Han characters counts as words and a line of full-width punctuation does not.
    """
    return bool(text) and bool(re.search(r"\w", text))


def heading_key(text: str) -> str:
    """A heading reduced to what it says, so one can be matched against another.

    Whitespace is collapsed, and the pagination marker the site appends to a split
    chapter's `<h1>` — `(1/2)` — is dropped. That marker is why a plain comparison
    would not do: the `<h1>` reads `第527章 … (1/2)` while a heading repeated in the
    body reads `第527章 …`, so the two only meet once the marker is gone.
    """
    collapsed = re.sub(r"\s+", " ", text).strip()

    return _PART_MARKER.sub("", collapsed).strip()


def parse_content(page) -> dict:
    """Read one page of a chapter: its heading, and the lines under it.

    The body is `div.content`'s own `<p>` children — direct children, because the
    wrapper also holds nested blocks that are not prose. A line carrying a link is
    dropped too: that is the site's own navigation, or its VIP pitch.

    Each line is stripped here rather than trusted to arrive stripped, so the
    emptiness `is_prose` tests for is emptiness after the leading ideographic spaces
    this site indents its paragraphs with.

    A line that is the chapter's own heading again goes as well: some chapters print
    it above the prose, and the reader already has it as `title`. Done per page, so a
    split chapter drops the heading each of its pages repeats.
    """
    heading = page.css("h1")
    title = heading[0].get_all_text(strip=True) if heading else ""
    repeated = heading_key(title)

    lines = []
    for node in page.css("div.content > p"):
        if node.css("a"):
            continue
        text = node.get_all_text(strip=True).strip()
        if not is_prose(text) or (repeated and heading_key(text) == repeated):
            continue
        lines.append(text)

    return {"title": title, "content": lines}


def next_part_url(page, chapter_url: str) -> str | None:
    """The next page of a chapter split over several, or None where there is one page.

    A long chapter is served as `…_527.html`, `…_527_2.html`, and so on. The link to
    the next page wears the same label as the link to the next chapter, so it is
    recognised by its href — the current page's own stem, one part further on.
    """
    stem, part = _stem_and_part(chapter_url)
    wanted = urljoin(chapter_url, f"{stem}_{part + 1}.html")

    for link in page.css("a"):
        href = link.attrib.get("href")
        if href and urljoin(chapter_url, href) == wanted:
            return wanted
    return None


def _stem_and_part(chapter_url: str) -> tuple[str, int]:
    """`…/8096_527_2.html` -> (`8096_527`, 2); `…/8096_527.html` -> (`8096_527`, 1).

    A name is `{list}_{chapter}` with an optional `_{part}` after it, so a third
    numeric group is a part number and a second one is the chapter's own.
    """
    name = chapter_url.rsplit("/", 1)[-1].removesuffix(".html")
    parts = name.split("_")

    if len(parts) >= 3 and parts[-1].isdigit():
        return "_".join(parts[:-1]), int(parts[-1])
    return name, 1


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
