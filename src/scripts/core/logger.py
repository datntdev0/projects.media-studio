"""Logging setup: the console, the log file, and a couple of corrections to Scrapling's."""

import logging
import sys
from contextvars import ContextVar

from .helpers import DATA_DIR

LOG_FILE = DATA_DIR / "scripts.log"
FORMAT = "%(asctime)s %(levelname)s %(name)s%(worker)s: %(message)s"

# Scrapling reports these at ERROR, but they only state what the page turned out to be:
# no challenge means the clearance cookie already covered it, or the site is not behind
# Cloudflare at all. Neither is a failure, and both are worth seeing at INFO.
INFORMATIONAL = ("No Cloudflare challenge found",)

# Which fetcher the current task speaks for. Each worker runs as its own task and gets
# its own copy, so a line can name the worker without every call passing an id along.
_worker: ContextVar[int | None] = ContextVar("worker", default=None)


def use_worker(worker_id: int) -> None:
    """Tag every later record from this task with `worker_id`."""
    _worker.set(worker_id)


class DemoteInformational(logging.Filter):
    """Rewrite the level on records that are informational despite being logged as errors."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno >= logging.ERROR and any(text in record.getMessage() for text in INFORMATIONAL):
            record.levelno = logging.INFO
            record.levelname = "INFO"
        return True


class TagWorker(logging.Filter):
    """Give every record a `worker` field, so one format string covers tagged and untagged lines."""

    def filter(self, record: logging.LogRecord) -> bool:
        worker = _worker.get()
        record.worker = f" [worker {worker}]" if worker else ""
        return True


def configure_logging() -> None:
    # A Windows console may not be UTF-8, and VieNeu logs emoji; better replaced than a crash.
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(errors="replace")
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    handlers = [logging.StreamHandler(), logging.FileHandler(LOG_FILE, encoding="utf-8")]
    logging.basicConfig(level=logging.INFO, format=FORMAT, handlers=handlers)
    # On the handlers rather than a logger: a filter set on a logger is not consulted for
    # records that reach it by propagation, and `worker` has to exist on every record.
    for handler in handlers:
        handler.addFilter(TagWorker())

    # huggingface_hub logs every HEAD it makes for the model files at INFO; only its failures matter.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    scrapling = logging.getLogger("scrapling")
    # A filter on the logger runs before any handler, so it covers every destination.
    scrapling.addFilter(DemoteInformational())
    # Scrapling installs its own stderr handler; together with the root handler above,
    # every one of its lines would be logged twice.
    scrapling.handlers.clear()
    scrapling.propagate = True
