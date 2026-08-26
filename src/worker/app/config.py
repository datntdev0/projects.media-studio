"""Runtime settings, all overridable through environment variables.

The browser options a caller can override per request live on `FetchOptions` instead.
"""

import os


class Settings:
    # Tabs the browser may keep open at once; also caps concurrent scrapes.
    max_pages: int = int(os.getenv("SCRAPER_MAX_PAGES", "4"))
    # Rebuild the browser when it has been unused this long, so a stale Cloudflare
    # clearance cookie cannot wedge every later request.
    idle_restart_seconds: int = int(os.getenv("SCRAPER_IDLE_RESTART_SECONDS", "900"))
    # Persist the browser profile so the Cloudflare clearance cookie survives a restart
    # and the next boot skips the challenge. Empty means a throwaway profile.
    user_data_dir: str = os.getenv("SCRAPER_USER_DATA_DIR", "").strip()


settings = Settings()
