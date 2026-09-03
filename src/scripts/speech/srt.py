"""Writing an .srt: one cue per narrated line, timed by that line's own clip."""

from pathlib import Path


def timestamp(seconds: float) -> str:
    total_ms = round(seconds * 1000)
    hours, total_ms = divmod(total_ms, 3_600_000)
    minutes, total_ms = divmod(total_ms, 60_000)
    secs, ms = divmod(total_ms, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def write_srt(lines: list[str], spans: list[tuple[float, float]], path: Path) -> None:
    """`spans` pairs each line with the seconds its clip starts and ends at in the wav."""
    blocks = [f"{index}\n{timestamp(start)} --> {timestamp(end)}\n{line}" for index, (line, (start, end)) in enumerate(zip(lines, spans), start=1)]
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")
