"""Shared options."""

from dataclasses import dataclass


@dataclass
class FetchOptions:
    """Browser options a fetch may override.

    These defaults are what the shared browser is launched from, and what every scraping
    call falls back to when a parameter is omitted.
    """

    # novel543 serves a non-interactive Cloudflare turnstile that only clears with a
    # visible browser, so the browser is run headful with its window moved off screen.
    headless: bool = False
    solve: bool = True
    timeout: int = 120
    """Per-operation timeout in seconds."""

    @property
    def timeout_ms(self) -> int:
        """Scrapling wants milliseconds."""
        return self.timeout * 1000
