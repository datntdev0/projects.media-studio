"""Shared .srt timestamp/read/write helpers — used by both the speech pipeline (one cue per
narrated line) and the export pipeline (re-timing several chapters' cues back to back).
"""

import re
from pathlib import Path

_CUE_RE = re.compile(r"(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})\n(.+?)(?=\n\n|\Z)", re.S)


def timestamp(seconds: float) -> str:
    total_ms = round(seconds * 1000)
    hours, total_ms = divmod(total_ms, 3_600_000)
    minutes, total_ms = divmod(total_ms, 60_000)
    secs, ms = divmod(total_ms, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def write_srt(texts: list[str], durations: list[float], path: Path) -> None:
    cursor = 0.0
    blocks = []
    for index, (text, duration) in enumerate(zip(texts, durations), start=1):
        start, cursor = cursor, cursor + duration
        blocks.append(f"{index}\n{timestamp(start)} --> {timestamp(cursor)}\n{text}")
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def parse_srt(path: Path) -> list[tuple[str, float]]:
    """Reads an srt's cues back as (text, duration) pairs, in order — the shape `write_srt`
    needs to re-time the same lines after concatenating them with other cues.
    """
    text = path.read_text(encoding="utf-8")
    cues = []
    for match in _CUE_RE.finditer(text):
        sh, sm, ss, sms, eh, em, es, ems, body = match.groups()
        start = int(sh) * 3600 + int(sm) * 60 + int(ss) + int(sms) / 1000
        end = int(eh) * 3600 + int(em) * 60 + int(es) + int(ems) / 1000
        cues.append((body.strip(), end - start))
    return cues
