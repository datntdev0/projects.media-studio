"""Turns a POST /speech payload into a stitched wav + matching srt on disk.

Each line of `texts` is synthesized on its own, sped up or slowed down to `pace`,
then lined up back to back — both in the final wav (via ffmpeg concat) and in the
srt, where every line's timing comes from that line's own clip duration.
"""

import asyncio
import hashlib
import json
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

import ffmpeg
import soundfile as sf

from .config import settings
from .models import Speech, SpeechRequest
from .tts import tts_engine

# Where generated speech files (wav + srt) are written, keyed by date then speech id.
SPEECH_DIR = settings.app_dir_path / "speech"

# ffmpeg's atempo filter only accepts a factor in this range; wider paces are
# reached by chaining several atempo filters together.
ATEMPO_MIN = 0.5
ATEMPO_MAX = 2.0


def _payload_id(request: SpeechRequest) -> str:
    minified = json.dumps(request.model_dump(), separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(minified.encode("utf-8")).hexdigest()


def _atempo_factors(pace: float) -> list[float]:
    factors = []
    remaining = pace
    while remaining < ATEMPO_MIN or remaining > ATEMPO_MAX:
        step = ATEMPO_MAX if remaining > ATEMPO_MAX else ATEMPO_MIN
        factors.append(step)
        remaining /= step
    factors.append(remaining)
    return factors


def _run_ffmpeg(stream) -> None:
    stream.overwrite_output().run(quiet=True, capture_stdout=True, capture_stderr=True)


async def _apply_pace(src: Path, dst: Path, pace: float) -> None:
    if pace == 1.0:
        await asyncio.to_thread(shutil.copyfile, src, dst)
        return
    stream = ffmpeg.input(str(src))
    for factor in _atempo_factors(pace):
        stream = stream.filter("atempo", factor)
    await asyncio.to_thread(_run_ffmpeg, ffmpeg.output(stream, str(dst)))


async def _concat_wavs(parts: list[Path], dst: Path) -> None:
    """Concatenate via the concat demuxer + stream copy — the parts share a format, so no re-encode is needed."""
    list_file = dst.with_suffix(".txt")
    list_file.write_text("\n".join(f"file '{part.resolve().as_posix()}'" for part in parts), encoding="utf-8")
    try:
        stream = ffmpeg.input(str(list_file), format="concat", safe=0)
        await asyncio.to_thread(_run_ffmpeg, ffmpeg.output(stream, str(dst), c="copy"))
    finally:
        list_file.unlink(missing_ok=True)


def _timestamp(seconds: float) -> str:
    total_ms = round(seconds * 1000)
    hours, total_ms = divmod(total_ms, 3_600_000)
    minutes, total_ms = divmod(total_ms, 60_000)
    secs, ms = divmod(total_ms, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def _write_srt(texts: list[str], durations: list[float], path: Path) -> None:
    cursor = 0.0
    blocks = []
    for index, (text, duration) in enumerate(zip(texts, durations), start=1):
        start, cursor = cursor, cursor + duration
        blocks.append(f"{index}\n{_timestamp(start)} --> {_timestamp(cursor)}\n{text}")
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


async def generate_speech(request: SpeechRequest) -> Speech:
    speech_id = _payload_id(request)
    date = datetime.now().strftime("%Y%m%d")
    out_dir = SPEECH_DIR / date
    out_dir.mkdir(parents=True, exist_ok=True)
    wav_path = out_dir / f"{speech_id}.wav"
    srt_path = out_dir / f"{speech_id}.srt"

    with tempfile.TemporaryDirectory(prefix="speech-") as tmp:
        tmp_dir = Path(tmp)
        parts: list[Path] = []
        durations: list[float] = []

        for index, text in enumerate(request.texts):
            audio = await tts_engine.infer(text, voice=request.voice)
            raw_path = tmp_dir / f"{index}.raw.wav"
            await asyncio.to_thread(sf.write, str(raw_path), audio, tts_engine.sample_rate)

            part_path = tmp_dir / f"{index}.wav"
            await _apply_pace(raw_path, part_path, request.pace)
            info = await asyncio.to_thread(sf.info, str(part_path))
            durations.append(info.frames / info.samplerate)
            parts.append(part_path)

        await _concat_wavs(parts, wav_path)

    _write_srt(request.texts, durations, srt_path)
    return Speech(id=speech_id, date=date)
