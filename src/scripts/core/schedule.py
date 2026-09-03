"""Deferring a run to a later time — shared by every script that takes `--scheduled`."""

import asyncio
import logging
from datetime import datetime

logger = logging.getLogger("schedule")


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
