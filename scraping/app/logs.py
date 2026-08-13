"""Logging setup for the service, including a couple of corrections to Scrapling's."""

import logging

FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"

# Scrapling reports these at ERROR, but they only state what the page turned out to be:
# no challenge means the clearance cookie already covered it, or the site is not behind
# Cloudflare at all. Neither is a failure, and both are worth seeing at INFO.
INFORMATIONAL = ("No Cloudflare challenge found",)


class DemoteInformational(logging.Filter):
    """Rewrite the level on records that are informational despite being logged as errors."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno >= logging.ERROR and any(text in record.getMessage() for text in INFORMATIONAL):
            record.levelno = logging.INFO
            record.levelname = "INFO"
        return True


def configure() -> None:
    logging.basicConfig(level=logging.INFO, format=FORMAT)

    scrapling = logging.getLogger("scrapling")
    # A filter on the logger runs before any handler, so it covers every destination.
    scrapling.addFilter(DemoteInformational())
    # Scrapling installs its own stderr handler; together with the root handler above,
    # every one of its lines would be logged twice.
    scrapling.handlers.clear()
    scrapling.propagate = True
