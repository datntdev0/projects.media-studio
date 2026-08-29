"""Turns a POST /speech payload into a stitched wav + matching srt on disk, in the background.

`texts` is synthesized in one `infer_batch` call — the engine itself groups the list into
`settings.speech.batch_size`-sized forward passes — then each line is sped up or slowed down
to `pace` and lined up back to back, both in the final wav (via ffmpeg concat) and in the srt,
where every line's timing comes from that line's own clip duration. A whole chapter can take
many minutes on CPU, comfortably longer than any HTTP client wants to hold a connection open
for, so generation runs as a background task and the caller polls the shared speech directory
for the id it's given instead of waiting on the request.
"""

import asyncio
import hashlib
import json
import logging
import os
import shutil
import tempfile
from pathlib import Path

import ffmpeg
import soundfile as sf
from ffmpeg import Error as FFmpegError

from .config import settings
from .models import SpeechRequest
from .srt import write_srt
from .tts import tts_engine

logger = logging.getLogger(__name__)

# Where generated speech files (wav + srt) are written — flat, keyed by a hash of the request
# payload (voice + texts + pace) rather than nested under a date. An identical payload — e.g. a
# retry after the caller timed out waiting for a slow batch — reuses the existing pair instead of
# resynthesizing from scratch; changing so much as one line's text or the voice/pace gets a new id.
SPEECH_DIR = settings.app_dir_path / "speech"

# Keeps a reference to in-flight background tasks so they aren't garbage-collected mid-run.
_pending_tasks: set[asyncio.Task] = set()


def _payload_id(request: SpeechRequest) -> str:
    minified = json.dumps(request.model_dump(), separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(minified.encode("utf-8")).hexdigest()

# ffmpeg's atempo filter only accepts a factor in this range; wider paces are
# reached by chaining several atempo filters together.
ATEMPO_MIN = 0.5
ATEMPO_MAX = 2.0


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
        # dst is a ".wav.tmp" path so ffmpeg can't guess the muxer from the extension; say so explicitly.
        await asyncio.to_thread(_run_ffmpeg, ffmpeg.output(stream, str(dst), c="copy", format="wav"))
    finally:
        list_file.unlink(missing_ok=True)


async def _synthesize(speech_id: str, texts: list[str], voice: str, pace: float, tmp_dir: Path) -> tuple[list[Path], list[float]]:
    """Synthesizes all of `texts` in one `infer_batch` call — the engine groups them internally
    into `settings.speech.batch_size`-sized forward passes, bucketed by length to minimize
    padding. Returns each line's paced clip path and duration, in `texts` order, ready for
    `_concat_wavs`/`_write_srt`.
    """
    audios = await tts_engine.infer_batch(texts, voice=voice, batch_size=settings.speech.batch_size)
    logger.info("speech %s: synthesized %d line(s)", speech_id, len(texts))

    parts: list[Path] = []
    durations: list[float] = []
    for index, audio in enumerate(audios):
        raw_path = tmp_dir / f"{index}.raw.wav"
        await asyncio.to_thread(sf.write, str(raw_path), audio, tts_engine.sample_rate)

        part_path = tmp_dir / f"{index}.wav"
        await _apply_pace(raw_path, part_path, pace)
        info = await asyncio.to_thread(sf.info, str(part_path))
        durations.append(info.frames / info.samplerate)
        parts.append(part_path)

    return parts, durations


# Ids currently being generated, so a duplicate request for the same payload (e.g. a caller
# that polled once, gave up, and retried) joins the run already in flight instead of starting
# a second one.
_in_flight: set[str] = set()


async def start_speech_generation(request: SpeechRequest) -> str:
    """Schedules synthesis in the background and returns the payload's id immediately.

    The caller polls the shared speech directory for `<id>.wav`/`<id>.srt` (present on success)
    or `<id>.error` (present on failure) instead of waiting on this call.
    """
    speech_id = _payload_id(request)
    SPEECH_DIR.mkdir(parents=True, exist_ok=True)
    wav_path = SPEECH_DIR / f"{speech_id}.wav"
    srt_path = SPEECH_DIR / f"{speech_id}.srt"

    if wav_path.exists() and srt_path.exists():
        logger.info("reusing cached speech %s for %d line(s)", speech_id, len(request.texts))
        return speech_id

    if speech_id in _in_flight:
        logger.info("speech %s is already generating — not starting a second run", speech_id)
        return speech_id

    error_path = SPEECH_DIR / f"{speech_id}.error"
    error_path.unlink(missing_ok=True)
    _in_flight.add(speech_id)

    task = asyncio.create_task(_run_generation(request, speech_id, wav_path, srt_path, error_path))
    _pending_tasks.add(task)
    task.add_done_callback(lambda t: (_pending_tasks.discard(t), _in_flight.discard(speech_id)))

    return speech_id


async def _run_generation(request: SpeechRequest, speech_id: str, wav_path: Path, srt_path: Path, error_path: Path) -> None:
    """Synthesizes to temp files next to the final ones and only renames them into place once
    complete, srt first then wav — so a poller that finds `wav_path` never sees a partial file,
    and knows `srt_path` is already there too.
    """
    logger.info("generating speech %s for %d line(s) (voice=%s, pace=%s)", speech_id, len(request.texts), request.voice, request.pace)
    tmp_wav = wav_path.with_suffix(".wav.tmp")
    tmp_srt = srt_path.with_suffix(".srt.tmp")
    try:
        with tempfile.TemporaryDirectory(prefix="speech-") as tmp:
            parts, durations = await _synthesize(speech_id, request.texts, request.voice, request.pace, Path(tmp))
            await _concat_wavs(parts, tmp_wav)
        write_srt(request.texts, durations, tmp_srt)
        os.replace(tmp_srt, srt_path)
        os.replace(tmp_wav, wav_path)
        logger.info("speech generation complete: %s", wav_path.name)
    except Exception as exc:  # noqa: BLE001 - reported to the polling caller via the error file, not raised
        logger.exception("speech generation failed for %s", speech_id)
        detail = exc.stderr.decode(errors="replace") if isinstance(exc, FFmpegError) and exc.stderr else str(exc)
        error_path.write_text(detail, encoding="utf-8")
        tmp_wav.unlink(missing_ok=True)
        tmp_srt.unlink(missing_ok=True)
