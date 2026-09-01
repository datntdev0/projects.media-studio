"""Scrape a novel straight into a library package (.zip) the app can import.

This is the standalone counterpart to the app's own export: it writes the exact archive
layout described in src/shared/app-library-package.ts, so what it produces can be handed
to the library dialog's "From a .zip" flow without any further conversion.

Run it through the scraper's virtualenv, which `npm run scrape --` does for you:

    npm run scrape -- --source-url https://www.novel543.com/0413553971 --range 1-50 --workers 4 --output ./data

Which crawler reads the site is worked out from the source URL's host, so there is no flag
for it. `--output` is relative to wherever you run it from; everything the scraper itself
needs — the crawlers in `scraping/`, the persisted browser profile and the log under
`data/` — resolves relative to this file rather than the current directory, so it does not
matter where that is.

Every chapter the source lists goes into the manifest. Those the range names are fetched
and carry their text; the rest are recorded as placeholders, exactly as the app records a
chapter it has discovered but not yet downloaded.
"""

import argparse
import asyncio
import json
import logging
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from core.logger import configure_logging, use_worker
from core.options import FetchOptions
from scraping import scraper
from scraping.browser import browser

logger = logging.getLogger("scrape")

# Must match LIBRARY_PACKAGE_SCHEMA in src/shared/app-library-package.ts.
SCHEMA = 1
MANIFEST_NAME = "library.json"
CHAPTERS_DIR = "chapters"
IDX_WIDTH = 4

# The path characters Windows reserves, and the C0 control range — mirrors packageSlug()
# in src/main/helpers/library-package.ts so both ends name an archive the same way.
RESERVED_FILENAME_CHARS = set('\\/:*?"<>|')
LAST_CONTROL_CODE_POINT = 0x1F
MAX_SLUG_LENGTH = 80

# What the app's NovelStatus accepts, and the site wordings that map onto it.
NOVEL_STATUS_ALIASES = {
    "ongoing": "ongoing",
    "complete": "complete",
    "completed": "complete",
    "hiatus": "hiatus",
    "连载中": "ongoing",
    "連載中": "ongoing",
    "已完结": "complete",
    "已完結": "complete",
    "完本": "complete",
}
DEFAULT_NOVEL_STATUS = "ongoing"

# Content statuses the manifest may carry, matching AppLibraryContentStatus.
STATUS_COMPLETED = "completed"
STATUS_DISCOVERED = "discovered"
STATUS_FAILED = "failed"


def package_slug(title: str) -> str:
    """A title reduced to something a file system will accept, keeping the characters it can."""
    kept = [char for char in title if char not in RESERVED_FILENAME_CHARS and ord(char) > LAST_CONTROL_CODE_POINT]
    cleaned = "-".join("".join(kept).split()).strip(".-")[:MAX_SLUG_LENGTH]
    return cleaned or "library"


def chapter_file(idx: int) -> str:
    return f"{CHAPTERS_DIR}/chapter-{idx:0{IDX_WIDTH}d}.txt"


def parse_range(expression: str, total: int) -> set[int]:
    """The chapter numbers a range names — `all`, or `1,3,5` / `23-34` over the site's own numbering."""
    expression = (expression or "all").strip()
    if expression == "all":
        return set(range(1, total + 1))

    wanted: set[int] = set()
    for token in expression.strip("[]()").split(","):
        bounds = [part.strip() for part in token.replace(":", "-").split("-")]
        if not all(part.isdigit() and int(part) > 0 for part in bounds) or len(bounds) > 2:
            raise ValueError(f"'{expression}' is not a range. Try 'all', '1,3,5' or '23-34'.")
        first, last = int(bounds[0]), int(bounds[-1])
        wanted.update(range(first, last + 1))

    return wanted


def parse_scheduled(value: str | None) -> datetime | None:
    """When to start, as a local ISO-8601 time like `2026-09-02T01:30`. A time already past is refused."""
    if not value:
        return None

    try:
        when = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"'{value}' is not an ISO-8601 time, e.g. 2026-09-02T01:30.") from error

    if when <= datetime.now(when.tzinfo):
        raise ValueError(f"'{value}' is not a time in the future.")
    return when


async def wait_until(when: datetime) -> None:
    delay = (when - datetime.now(when.tzinfo)).total_seconds()
    if delay <= 0:
        return
    logger.info("waiting until %s (%.0f minutes)", when.isoformat(timespec="minutes"), delay / 60)
    await asyncio.sleep(delay)


def novel_status(raw: str | None) -> str:
    return NOVEL_STATUS_ALIASES.get((raw or "").strip().lower(), DEFAULT_NOVEL_STATUS)


async def fetch_bodies(module, chapters: list[dict], wanted: set[int], options: FetchOptions, workers: int) -> dict[int, str]:
    """Fetch every wanted chapter's text, keyed by chapter number.

    Each worker takes one chapter and reads it whole before taking the next, so a chapter
    split over several pages has its parts fetched one after the other instead of every
    chapter's first page going first and the second pages queueing behind them. The pool is
    sized to --workers, the same number the browser opened tabs for. A chapter that will not
    come back is left out rather than aborting the run: a long scrape should not lose
    everything to one bad page.
    """
    selected = [chapter for chapter in chapters if chapter["index"] in wanted]
    pending: asyncio.Queue[dict] = asyncio.Queue()
    for chapter in selected:
        pending.put_nowait(chapter)

    bodies: dict[int, str] = {}
    done = 0

    async def work(worker_id: int) -> None:
        nonlocal done
        use_worker(worker_id)
        while True:
            try:
                chapter = pending.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                content = await scraper.read_content(module, chapter["url"], options)
                bodies[chapter["index"]] = "\n".join(content["content"])
            except Exception as error:
                logger.warning("chapter %d (%s) failed: %s", chapter["index"], chapter["url"], error)
            finally:
                done += 1
                logger.info("chapter %d done (%d/%d)", chapter["index"], done, len(selected))

    await asyncio.gather(*(work(worker_id) for worker_id in range(1, min(workers, len(selected)) + 1)))
    return bodies


def build_manifest(source_url: str, metadata: dict, chapters: list[dict], wanted: set[int], bodies: dict[int, str], language: str, cover_name: str | None) -> dict:
    """The `library.json` the archive is built around."""
    category = metadata.get("category")

    records = []
    for chapter in chapters:
        index = chapter["index"]
        has_body = index in bodies
        if has_body:
            status = STATUS_COMPLETED
        elif index in wanted:
            status = STATUS_FAILED
        else:
            status = STATUS_DISCOVERED

        records.append(
            {
                "idx": index,
                "title": chapter["title"],
                "language": language,
                "status": status,
                "file": chapter_file(index) if has_body else None,
            }
        )

    return {
        "schema": SCHEMA,
        "exportedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "library": {
            "title": metadata.get("title") or source_url,
            "type": "novel",
            "cover": cover_name,
            "novel": {
                "status": novel_status(metadata.get("status")),
                "author": metadata.get("author") or "",
                "language": language,
                "genres": [category] if category else [],
                "description": metadata.get("description") or "",
            },
        },
        "chapters": records,
    }


def write_package(output_dir: Path, manifest: dict, bodies: dict[int, str], cover: tuple[str, bytes] | None) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"library.{package_slug(manifest['library']['title'])}.zip"

    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for index, body in sorted(bodies.items()):
            archive.writestr(chapter_file(index), body)
        if cover:
            archive.writestr(cover[0], cover[1])
        archive.writestr(MANIFEST_NAME, json.dumps(manifest, ensure_ascii=False, indent=2))

    return target


async def scrape(args: argparse.Namespace) -> Path:
    module = scraper.find_crawler(args.source_url)
    options = FetchOptions(timeout=args.timeout)
    wanted_expression = args.range

    scheduled = parse_scheduled(args.scheduled)
    if scheduled:
        await wait_until(scheduled)

    await browser.start(args.workers)
    try:
        metadata = await scraper.read_metadata(module, args.source_url, options)
        chapters = await scraper.read_chapters(module, args.source_url, options)
        logger.info("%s — %d chapters listed", metadata.get("title") or args.source_url, len(chapters))

        wanted = parse_range(wanted_expression, len(chapters))
        bodies = await fetch_bodies(module, chapters, wanted, options, args.workers)

        cover = None
        cover_url = metadata.get("cover_url")
        if cover_url:
            image = await scraper.read_cover_image(cover_url, options)
            if image:
                body, media_type = image
                cover = (f"cover.{media_type.rsplit('/', 1)[-1].replace('jpeg', 'jpg')}", body)
            else:
                logger.warning("the cover URL did not return an image; the package will carry none")
    finally:
        await browser.close()

    language = scraper.crawler_language(module)
    manifest = build_manifest(args.source_url, metadata, chapters, wanted, bodies, language, cover[0] if cover else None)
    target = write_package(Path(args.output), manifest, bodies, cover)

    # Counted over the chapters that actually exist — a range may name numbers the site does not list.
    failed = sum(1 for chapter in chapters if chapter["index"] in wanted and chapter["index"] not in bodies)
    logger.info("wrote %s — %d chapters with text%s", target, len(bodies), f", {failed} failed" if failed else "")
    return target


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-url", required=True, help="The book's URL on the source site")
    parser.add_argument("--range", default="all", help="Which chapters to fetch: 'all' (default), '1,3,5' or '23-34'")
    parser.add_argument("--workers", type=int, default=4, help="How many chapters to fetch at once, i.e. browser tabs (default 4)")
    parser.add_argument("--scheduled", help="Start at this local ISO-8601 time instead of now, e.g. 2026-09-02T01:30")
    parser.add_argument("--output", default=".", help="Directory to write the .zip into (default: the current one)")
    parser.add_argument("--timeout", type=int, default=FetchOptions().timeout, help="Per-page timeout in seconds")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    args = parse_args(argv)

    try:
        asyncio.run(scrape(args))
    except ValueError as error:
        logger.error("%s", error)
        return 2
    except scraper.PageError as error:
        logger.error("%s", error)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
