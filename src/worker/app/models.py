"""Request and response models. Fields are snake_case in Python and camelCase over the wire."""

from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


@dataclass
class FetchOptions:
    """Browser options a caller may override per request.

    These defaults are the service-wide defaults: the shared browser is launched from
    them, and every endpoint falls back to them when a parameter is omitted.
    """

    # novel543 serves a non-interactive Cloudflare turnstile that only clears with a
    # visible browser, so the container runs the browser against an Xvfb display.
    headless: bool = False
    solve: bool = True
    timeout: int = 120
    """Per-operation timeout in seconds."""

    @property
    def timeout_ms(self) -> int:
        """Scrapling wants milliseconds."""
        return self.timeout * 1000


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Chapter(CamelModel):
    index: int
    title: str
    url: str


class ChapterContent(CamelModel):
    """One chapter's text, as lines. `title` is the chapter's own heading, not the book's.

    A list rather than one string because that is what the page is: the paragraphs
    stay separate, and whoever stores them decides what goes between them.
    """

    title: str
    content: list[str]


class Novel(CamelModel):
    id: str
    url: str
    crawler: str
    title: str | None = None
    author: str | None = None
    category: str | None = None
    status: str | None = None
    updated_at: str | None = None
    latest_chapter: str | None = None
    latest_chapter_url: str | None = None
    read_url: str | None = None
    cover_url: str | None = None
    description: str | None = None


class Health(CamelModel):
    status: str
    browser_running: bool
    pages_in_use: int | None = None


class SpeechRequest(CamelModel):
    """One line is synthesized per entry of `texts`, at `pace` (1.0 is normal speed)."""

    voice: str
    texts: list[str] = Field(min_length=1)
    pace: float = Field(default=1.0, gt=0)


class Speech(CamelModel):
    id: str
    date: str
