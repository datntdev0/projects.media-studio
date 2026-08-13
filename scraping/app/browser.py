"""One long-lived stealth browser shared by every request.

Solving the Cloudflare challenge costs most of the time on a cold start, so the
session is started once and reused; later requests ride on the clearance cookie
already in the browser profile.
"""

import asyncio
import logging
import time
from pathlib import Path

from scrapling.fetchers import AsyncStealthySession

from .config import settings
from .models import FetchOptions

logger = logging.getLogger(__name__)

# The shared browser is launched from the FetchOptions defaults, so a request that only
# uses defaults can reuse it.
DEFAULTS = FetchOptions()

# Chromium refuses to open a profile that still looks busy. A container killed without a
# clean shutdown leaves these behind, which would wedge every later launch.
PROFILE_LOCKS = ("SingletonLock", "SingletonCookie", "SingletonSocket")


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
        self._slots = asyncio.Semaphore(settings.max_pages)
        self._last_used = 0.0

    @property
    def running(self) -> bool:
        return self._session is not None

    def pool_stats(self) -> dict | None:
        if self._session is None:
            return None
        try:
            return self._session.get_pool_stats()
        except Exception:  # the pool is an implementation detail, never fail health on it
            return None

    async def start(self) -> None:
        async with self._lock:
            await self._ensure_session()

    async def _ensure_session(self) -> AsyncStealthySession:
        """Caller must hold the lock. Recreates the session when idle for too long."""
        idle = time.monotonic() - self._last_used
        if self._session is not None and settings.idle_restart_seconds and idle > settings.idle_restart_seconds:
            logger.info("browser idle for %.0fs, restarting it", idle)
            await self._close_session()

        if self._session is None:
            logger.info("starting browser (headless=%s, profile=%s)", DEFAULTS.headless, settings.user_data_dir or "-")
            options = {
                "headless": DEFAULTS.headless,
                "solve_cloudflare": DEFAULTS.solve,
                "timeout": DEFAULTS.timeout_ms,
                "max_pages": settings.max_pages,
            }
            if settings.user_data_dir:
                profile = Path(settings.user_data_dir)
                profile.mkdir(parents=True, exist_ok=True)
                _clear_profile_locks(profile)
                options["user_data_dir"] = str(profile)
            session = AsyncStealthySession(**options)
            await session.start()
            self._session = session
            # Stamped at launch, not just on use: monotonic() starts at the machine's
            # uptime, so an unstamped session would look idle for hours straight away
            # and the first request would throw the warm browser out.
            self._last_used = time.monotonic()
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
        """Fetch a URL, applying the per-request overrides the caller asked for."""
        options = options or DEFAULTS
        params = {"solve_cloudflare": options.solve, "timeout": options.timeout_ms}

        # headless is fixed when the browser launches, so it cannot ride the shared one.
        if options.headless != DEFAULTS.headless:
            return await self._fetch_isolated(url, options, params)
        return await self._fetch_shared(url, params)

    async def _fetch_shared(self, url: str, params: dict):
        """The fast path: reuse the warm browser, restarting it once if it has died."""
        async with self._slots:
            for attempt in (1, 2):
                async with self._lock:
                    session = await self._ensure_session()
                try:
                    response = await session.fetch(url, **params)
                    self._last_used = time.monotonic()
                    return response
                except Exception:
                    logger.warning("fetch failed for %s (attempt %d)", url, attempt, exc_info=True)
                    async with self._lock:
                        await self._close_session()
                    if attempt == 2:
                        raise
        raise RuntimeError("unreachable")

    async def _fetch_isolated(self, url: str, options: FetchOptions, params: dict):
        """A one-off browser for a headless override.

        It gets a throwaway profile on purpose: the shared browser holds the persisted
        one open, and Chromium refuses to run two instances against the same profile.
        That also means this path always pays for the Cloudflare challenge.
        """
        logger.info("one-off browser for %s (headless=%s)", url, options.headless)
        async with self._slots:
            session = AsyncStealthySession(
                headless=options.headless,
                solve_cloudflare=options.solve,
                timeout=options.timeout_ms,
                max_pages=1,
            )
            await session.start()
            try:
                return await session.fetch(url, **params)
            finally:
                try:
                    await session.close()
                except Exception:
                    logger.warning("one-off browser did not close cleanly", exc_info=True)

    async def close(self) -> None:
        async with self._lock:
            await self._close_session()


browser = BrowserManager()
