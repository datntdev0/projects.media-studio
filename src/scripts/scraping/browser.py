"""One long-lived stealth browser shared by every fetch.

Solving the Cloudflare challenge costs most of the time on a cold start, so the
session is started once and reused; later fetches ride on the clearance cookie
already in the browser profile.
"""

import asyncio
import logging
from pathlib import Path

from scrapling.fetchers import AsyncStealthySession

from core.helpers import DATA_DIR
from core.options import FetchOptions

logger = logging.getLogger(__name__)

# The shared browser is launched from the FetchOptions defaults, so a fetch that only
# uses defaults can reuse it.
DEFAULTS = FetchOptions()

# The persisted profile lives inside the scripts directory, beside the code that uses it.
# Keeping it is what makes a second run cheap: the Cloudflare clearance cookie survives.
PROFILE_DIR = DATA_DIR / "browser-profile"

# Tabs to keep open when the caller does not say. `start()` sets the real number from
# the scrape's --workers, which is the only thing that should decide it.
DEFAULT_MAX_PAGES = 1

# Chromium refuses to open a profile that still looks busy. A run killed without a clean
# shutdown leaves these behind, which would wedge every later launch.
PROFILE_LOCKS = ("SingletonLock", "SingletonCookie", "SingletonSocket")

# Cloudflare only clears for a headful browser, but nothing says that browser has to be on
# screen — moving its window off the visible desktop keeps it headful without popping up in
# front of the user. Has no effect when headless, so it's safe to pass unconditionally.
HIDDEN_WINDOW_FLAGS = ["--window-position=-32000,-32000"]


def _clear_profile_locks(profile: Path) -> None:
    for name in PROFILE_LOCKS:
        lock = profile / name
        try:
            if lock.is_symlink() or lock.exists():
                lock.unlink()
                logger.info("removed stale profile lock %s", lock)
        except OSError:
            logger.warning("could not remove %s", lock, exc_info=True)


class BrowserManager:
    def __init__(self) -> None:
        self._session: AsyncStealthySession | None = None
        self._lock = asyncio.Lock()
        self._max_pages = DEFAULT_MAX_PAGES
        self._slots = asyncio.Semaphore(DEFAULT_MAX_PAGES)

    async def start(self, max_pages: int = DEFAULT_MAX_PAGES) -> None:
        """Warm the browser up front, sized to run `max_pages` fetches at once.

        This is the one place concurrency is set: the tab pool and the semaphore guarding
        it are the same number, so callers can launch everything and be throttled here
        rather than counting fetches themselves.
        """
        self._max_pages = max(1, max_pages)
        self._slots = asyncio.Semaphore(self._max_pages)
        async with self._lock:
            await self._ensure_session()

    async def _ensure_session(self) -> AsyncStealthySession:
        """Caller must hold the lock."""
        if self._session is None:
            logger.info("starting browser (headless=%s, tabs=%d, profile=%s)", DEFAULTS.headless, self._max_pages, PROFILE_DIR)
            PROFILE_DIR.mkdir(parents=True, exist_ok=True)
            _clear_profile_locks(PROFILE_DIR)
            session = AsyncStealthySession(
                headless=DEFAULTS.headless,
                solve_cloudflare=DEFAULTS.solve,
                timeout=DEFAULTS.timeout_ms,
                max_pages=self._max_pages,
                user_data_dir=str(PROFILE_DIR),
                extra_flags=HIDDEN_WINDOW_FLAGS,
            )
            await session.start()
            self._session = session
        return self._session

    async def _close_session(self) -> None:
        session, self._session = self._session, None
        if session is None:
            return
        try:
            await session.close()
        except Exception:
            logger.warning("browser did not close cleanly", exc_info=True)

    async def fetch(self, url: str, options: FetchOptions | None = None):
        """Fetch a URL, reusing the warm browser and restarting it once if it has died."""
        options = options or DEFAULTS
        params = {"solve_cloudflare": options.solve, "timeout": options.timeout_ms}

        async with self._slots:
            for attempt in (1, 2):
                async with self._lock:
                    session = await self._ensure_session()
                try:
                    return await session.fetch(url, **params)
                except Exception:
                    logger.warning("fetch failed for %s (attempt %d)", url, attempt, exc_info=True)
                    async with self._lock:
                        await self._close_session()
                    if attempt == 2:
                        raise
        raise RuntimeError("unreachable")

    async def close(self) -> None:
        async with self._lock:
            await self._close_session()


browser = BrowserManager()
