"""The crawler registry.

Each crawler is one `parser.<name>.py` module in this package exposing:

    BASE_URL                              the site root
    HOSTS                                 the host names a source URL may carry
    DEFAULT_LANGUAGE                      what the site publishes in
    resolve(source) -> (book_url, id)     validates the URL belongs to this site
    resolve_chapter(source) -> str        the same, for one chapter's own URL
    chapters_url(book_url) -> str         where the chapter list lives
    parse_metadata(page, book_url, id)    -> dict of Novel fields
    parse_chapters(page, id)              -> list of {index, title, url}
    parse_content(page)                   -> {title, content} for one page of a chapter
    next_part_url(page, chapter_url)      -> the chapter's next page, or None

Adding a site means dropping in the module and listing its name in CRAWLER_NAMES.
"""

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

PARSERS_DIR = Path(__file__).parent
CRAWLER_NAMES = ("novel543",)


def load(name: str) -> ModuleType:
    """Import `parser.<name>.py` from this package directory.

    The files follow the repository's `<kind>.<name>` naming, and a dot is not legal in
    a Python module name, so they are loaded by path rather than a plain `import`.
    """
    path = PARSERS_DIR / f"parser.{name}.py"
    spec = importlib.util.spec_from_file_location(f"{__package__}.parser_{name}", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load crawler at {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CRAWLERS: dict[str, ModuleType] = {name: load(name) for name in CRAWLER_NAMES}
