"""Turns a POST /export payload into a stitched mp4 (a static image muxed against the
concatenated narration of `chapter_range`'s chapters) plus a matching unified srt, on disk, in
the background — mirrors speech.py's job pattern (payload-hash id, background task, atomic
rename, in-flight de-dup) so the two endpoints behave the same way to callers.
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
import numpy as np
from ffmpeg import Error as FFmpegError
from PIL import Image

from .config import settings
from .models import CombineRequest, ExportRequest
from .srt import parse_srt, write_srt

logger = logging.getLogger(__name__)

# Flat, keyed by a hash of the request payload (workflow + chapter range + image) — an identical
# payload reuses the existing pair instead of re-muxing.
EXPORT_DIR = settings.app_dir_path / "export"

# Every export is muxed at a fixed Full HD frame, whatever the uploaded image's own resolution —
# see the `pad`/`force_original_aspect_ratio` use in `_run_export`.
FHD_WIDTH = 1920
FHD_HEIGHT = 1080
FPS = 60

# The circular dial's polar coordinate math (see `_wave_remap_maps`) depends only on pixel
# position, never on the audio itself, so it's computed once into a pair of lookup images and
# applied per frame via `remap` (native C, fast) instead of re-evaluating atan2/hypot/mod per
# pixel per frame via `geq` (an interpreted expression, and by far the CPU bottleneck of the
# sound-wave overlay before this). SOUND_WAVE_RENDER_SIZE is what `showwaves`/`remap` actually
# compute on; the result is then upscaled (cheap, ordinary bilinear resize) to
# SOUND_WAVE_DISPLAY_SIZE, the size actually overlaid on the video — this keeps the same on-screen
# circle while keeping the render size (and so the lookup images and remap cost) small.
# SOUND_WAVE_RATE similarly has `showwaves`/`remap` only run every other frame, deferred to `fps`
# restoring the video's real frame count afterward (a trivial dup/drop). Both sizes must be square
# (W=H) — the polar math treats H/2 as the radius for both axes, so a non-square capture would
# render as an ellipse.
SOUND_WAVE_RENDER_SIZE = "480x480"
SOUND_WAVE_DISPLAY_SIZE = "480x480"
SOUND_WAVE_RATE = 12

# Where the (small, one-time, cached-forever-per-size) remap lookup images live.
WAVE_REMAP_DIR = settings.app_dir_path / "cache"

# Keeps a reference to in-flight background tasks so they aren't garbage-collected mid-run.
_pending_tasks: set[asyncio.Task] = set()

# Ids currently being generated, so a duplicate request for the same payload joins the run
# already in flight instead of starting a second one.
_in_flight: set[str] = set()


def _payload_id(request: ExportRequest) -> str:
    minified = json.dumps(request.model_dump(), separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(minified.encode("utf-8")).hexdigest()


def _run_ffmpeg(stream) -> None:
    stream.overwrite_output().run(quiet=True, capture_stdout=True, capture_stderr=True)


def _uses_nvenc() -> bool:
    """Whether the configured encoder is an NVIDIA one — if so, the (otherwise CPU-only)
    per-frame image scale also runs on the GPU via CUDA, freeing the CPU for the wave overlay.
    """
    return "nvenc" in settings.export.video_codec


_wave_remap_paths: tuple[Path, Path] | None = None


def _wave_remap_maps() -> tuple[Path, Path]:
    """The (x, y) lookup images `remap` uses to warp `showwaves`' linear strip into a circular
    dial: for each output pixel, xmap/ymap hold the (angle, radius) position in the linear strip
    to sample from. Built once per process and cached to disk (keyed by render size) since the
    math is pixel-position-only, independent of any request's audio. `remap` requires the maps in
    `gray16le` — an 8-bit map silently produces a blank/`fill`-colored frame instead of an error.
    """
    global _wave_remap_paths
    if _wave_remap_paths is not None:
        return _wave_remap_paths

    w, h = (int(v) for v in SOUND_WAVE_RENDER_SIZE.split("x"))
    xmap_path = WAVE_REMAP_DIR / f"wave-xmap-{w}x{h}.png"
    ymap_path = WAVE_REMAP_DIR / f"wave-ymap-{w}x{h}.png"
    if not xmap_path.exists() or not ymap_path.exists():
        WAVE_REMAP_DIR.mkdir(parents=True, exist_ok=True)
        x, y = np.meshgrid(np.arange(w, dtype=np.float64), np.arange(h, dtype=np.float64))
        angle = (w / np.pi) * (np.pi + np.arctan2(h / 2 - y, x - w / 2))
        src_x = np.clip(np.mod(angle, w), 0, w - 1).astype(np.uint16)
        src_y = np.clip(h - 2 * np.hypot(h / 2 - y, x - w / 2), 0, h - 1).astype(np.uint16)
        Image.fromarray(src_x).save(xmap_path)
        Image.fromarray(src_y).save(ymap_path)

    _wave_remap_paths = (xmap_path, ymap_path)
    return _wave_remap_paths


async def _concat_wavs(parts: list[Path], dst: Path) -> None:
    """Concatenate via the concat demuxer + stream copy — the parts share a format, so no re-encode is needed."""
    list_file = dst.with_suffix(".txt")
    list_file.write_text("\n".join(f"file '{part.resolve().as_posix()}'" for part in parts), encoding="utf-8")
    try:
        stream = ffmpeg.input(str(list_file), format="concat", safe=0)
        await asyncio.to_thread(_run_ffmpeg, ffmpeg.output(stream, str(dst), c="copy", format="wav"))
    finally:
        list_file.unlink(missing_ok=True)


async def _concat_videos(parts: list[Path], dst: Path) -> None:
    """Concatenate already-muxed chapter clips via the concat demuxer + stream copy — they all
    share the same codec/resolution/fps (same image, same encoder settings), so no re-encode is
    needed, just a container-level splice.
    """
    list_file = dst.with_suffix(".txt")
    list_file.write_text("\n".join(f"file '{part.resolve().as_posix()}'" for part in parts), encoding="utf-8")
    try:
        stream = ffmpeg.input(str(list_file), format="concat", safe=0)
        # dst is a ".mp4.tmp" path so ffmpeg can't guess the muxer from the extension; say so explicitly.
        await asyncio.to_thread(_run_ffmpeg, ffmpeg.output(stream, str(dst), c="copy", format="mp4"))
    finally:
        list_file.unlink(missing_ok=True)


def _chapter_files(workflow_id: str, chapter_id: str) -> tuple[Path, Path]:
    """A chapter's already-narrated wav+srt, written by the Tts activity's `/speech` pipeline — Export Video only ever narrates from Vietnamese (the `ContentLanguage.Vietnamese` code, "vi", not the English word — this must match the folder name the Node side's `EXPORT_VIDEO_LANGUAGE` resolves to)."""
    chapters_dir = settings.app_dir_path / "workflows" / workflow_id / "audios" / "vi" / "chapters"
    return chapters_dir / f"{chapter_id}.wav", chapters_dir / f"{chapter_id}.srt"


def _merge_srts(srt_paths: list[Path], dst: Path) -> None:
    """Flattens every chapter's cues, in order, and re-times them back to back — each cue keeps
    its own original duration, so laying them out sequentially from zero reproduces the same
    timing as the audio concatenation these cues describe.
    """
    texts: list[str] = []
    durations: list[float] = []
    for srt_path in srt_paths:
        for text, duration in parse_srt(srt_path):
            texts.append(text)
            durations.append(duration)
    write_srt(texts, durations, dst)


async def start_export_generation(request: ExportRequest) -> tuple[str, str]:
    """Schedules the mux/concat in the background and returns (id, outputFile) immediately.

    The caller polls the shared export directory for `<id>.mp4`/`<id>.srt` (done) or `<id>.error`
    (failed) instead of waiting on this call. Raises `ValueError` up front — before scheduling
    anything — if a requested chapter has no narration yet, or the image file doesn't exist.
    """
    export_id = _payload_id(request)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    mp4_path = EXPORT_DIR / f"{export_id}.mp4"
    srt_path = EXPORT_DIR / f"{export_id}.srt"
    output_file = mp4_path.name

    if mp4_path.exists() and srt_path.exists():
        logger.info("reusing cached export %s for %d chapter(s)", export_id, len(request.chapter_range))
        return export_id, output_file

    for chapter_id in request.chapter_range:
        wav_path, srt_chapter_path = _chapter_files(request.workflow_id, chapter_id)
        if not wav_path.exists() or not srt_chapter_path.exists():
            raise ValueError(f"Chapter {chapter_id} has no narration for workflow {request.workflow_id} — run the Text-to-Speech activity first")

    image_path = settings.app_dir_path / request.image_file
    if not image_path.exists():
        raise ValueError(f"Image file {request.image_file} not found")

    if export_id in _in_flight:
        logger.info("export %s is already generating — not starting a second run", export_id)
        return export_id, output_file

    error_path = EXPORT_DIR / f"{export_id}.error"
    error_path.unlink(missing_ok=True)
    _in_flight.add(export_id)

    task = asyncio.create_task(_run_export(request, export_id, image_path, mp4_path, srt_path, error_path))
    _pending_tasks.add(task)
    task.add_done_callback(lambda t: (_pending_tasks.discard(t), _in_flight.discard(export_id)))

    return export_id, output_file


async def _run_export(request: ExportRequest, export_id: str, image_path: Path, mp4_path: Path, srt_path: Path, error_path: Path) -> None:
    """Muxes to temp files next to the final ones and only renames them into place once
    complete, srt first then mp4 — so a poller that finds `mp4_path` never sees a partial file,
    and knows `srt_path` is already there too.
    """
    logger.info("generating export %s for %d chapter(s)", export_id, len(request.chapter_range))
    tmp_mp4 = mp4_path.with_suffix(".mp4.tmp")
    tmp_srt = srt_path.with_suffix(".srt.tmp")
    try:
        with tempfile.TemporaryDirectory(prefix="export-") as tmp:
            chapter_files = [_chapter_files(request.workflow_id, chapter_id) for chapter_id in request.chapter_range]
            wav_paths = [wav for wav, _ in chapter_files]
            srt_paths = [srt for _, srt in chapter_files]

            combined_wav = Path(tmp) / "combined.wav"
            if len(wav_paths) > 1:
                await _concat_wavs(wav_paths, combined_wav)
            else:
                await asyncio.to_thread(shutil.copyfile, wav_paths[0], combined_wav)

            _merge_srts(srt_paths, tmp_srt)

            audio_stream = ffmpeg.input(str(combined_wav))
            gpu = _uses_nvenc()
            # Deliberately NOT `-loop 1` here: that input option re-decodes the source PNG on every
            # single output frame (confirmed by measurement — it alone pegged 6+ CPU cores for the
            # whole export, dwarfing the cost of every other filter combined, wave overlay included).
            # Instead the image is decoded once (a plain single-frame input), scaled/padded to FHD
            # once, and only THAT already-finished frame gets cheaply duplicated, via the `loop`
            # *filter* (not the input option) below.
            image_input = ffmpeg.input(str(image_path))
            if gpu:
                # Uploads the image to the GPU once and scales it there instead of on the CPU, then
                # brings it back down so the (CPU-only) wave overlay below can composite onto it.
                # nv12 both ways is deliberate: scale_cuda's CUDA kernels only cover a fixed set of format
                # pairs (rgb0 -> yuv420p isn't one of them, but nv12 -> nv12 always is), and hwdownload can
                # only emit the frame's actual underlying format — asking it for yuv420p directly errors
                # with "Invalid output format for hwframe download", so nv12 -> yuv420p runs as its own,
                # separate (ordinary, CPU) conversion once the frame is already back off the GPU. `pad` has
                # no CUDA filter, but that's moot — it needs the sw frame the hwdownload above already made.
                image_once = (
                    image_input.filter("format", "nv12")
                    .filter("hwupload_cuda")
                    .filter("scale_cuda", w=FHD_WIDTH, h=FHD_HEIGHT, force_original_aspect_ratio="decrease")
                    .filter("hwdownload")
                    .filter("format", "nv12")
                    .filter("format", "yuv420p")
                    .filter("pad", w=FHD_WIDTH, h=FHD_HEIGHT, x="(ow-iw)/2", y="(oh-ih)/2", color="black")
                )
            else:
                # An uploaded image is arbitrary size/aspect — scale it to fit within 1920x1080 without
                # distorting it, then letterbox/pillarbox whatever's left with black bars, so every export
                # is a full FHD frame regardless of the source image's own dimensions.
                image_once = (
                    image_input.filter("scale", w=FHD_WIDTH, h=FHD_HEIGHT, force_original_aspect_ratio="decrease")
                    .filter("pad", w=FHD_WIDTH, h=FHD_HEIGHT, x="(ow-iw)/2", y="(oh-ih)/2", color="black")
                )
            image_stream = image_once.filter("loop", loop=-1, size=1).filter("fps", FPS)
            if request.sound_wave:
                # showwaves draws a linear waveform strip; remap then warps it into a circular dial
                # via the precomputed xmap/ymap lookup (see `_wave_remap_maps`) — its output keeps
                # showwaves' black background, which colorkey then turns transparent so only the
                # wave line itself composites onto the image below.
                xmap_path, ymap_path = _wave_remap_maps()
                xmap_stream = ffmpeg.input(str(xmap_path), loop=1, framerate=SOUND_WAVE_RATE).filter("format", "gray16le")
                ymap_stream = ffmpeg.input(str(ymap_path), loop=1, framerate=SOUND_WAVE_RATE).filter("format", "gray16le")
                wave_linear = audio_stream.filter("aformat", cl="mono").filter("showwaves", s=SOUND_WAVE_RENDER_SIZE, rate=SOUND_WAVE_RATE, mode="cline", colors="white", draw="full")
                wave_stream = (
                    ffmpeg.filter([wave_linear, xmap_stream, ymap_stream], "remap", fill="black")
                    .filter("colorkey", "black", 0.15, 0.05)
                    .filter("fps", FPS)
                    .filter("scale", SOUND_WAVE_DISPLAY_SIZE.split("x")[0], SOUND_WAVE_DISPLAY_SIZE.split("x")[1])
                )
                video_stream = ffmpeg.filter([image_stream, wave_stream], "overlay", "(W-w)/2", "H-h-40")
            else:
                video_stream = image_stream
            # tmp_mp4 is a ".mp4.tmp" path so ffmpeg can't guess the muxer from the extension; say so explicitly.
            output = ffmpeg.output(video_stream, audio_stream, str(tmp_mp4), vcodec=settings.export.video_codec, acodec="aac", pix_fmt="yuv420p", shortest=None, movflags="faststart", format="mp4")
            if gpu:
                output = output.global_args("-init_hw_device", "cuda=cu", "-filter_hw_device", "cu")
            await asyncio.to_thread(_run_ffmpeg, output)

        os.replace(tmp_srt, srt_path)
        os.replace(tmp_mp4, mp4_path)
        logger.info("export generation complete: %s", mp4_path.name)
    except Exception as exc:  # noqa: BLE001 - reported to the polling caller via the error file, not raised
        logger.exception("export generation failed for %s", export_id)
        detail = exc.stderr.decode(errors="replace") if isinstance(exc, FFmpegError) and exc.stderr else str(exc)
        error_path.write_text(detail, encoding="utf-8")
        tmp_mp4.unlink(missing_ok=True)
        tmp_srt.unlink(missing_ok=True)


def _combine_payload_id(request: CombineRequest) -> str:
    minified = json.dumps(request.model_dump(), separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(minified.encode("utf-8")).hexdigest()


async def start_combine_generation(request: CombineRequest) -> tuple[str, str]:
    """Schedules the chapter-clip concat in the background and returns (id, outputFile)
    immediately — same polling contract as `start_export_generation`. Raises `ValueError` up
    front if a referenced chapter clip doesn't exist.
    """
    combine_id = _combine_payload_id(request)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    mp4_path = EXPORT_DIR / f"{combine_id}.mp4"
    srt_path = EXPORT_DIR / f"{combine_id}.srt"
    output_file = mp4_path.name

    if mp4_path.exists() and srt_path.exists():
        logger.info("reusing cached combine %s for %d chapter(s)", combine_id, len(request.chapter_video_files))
        return combine_id, output_file

    video_paths = [settings.app_dir_path / file for file in request.chapter_video_files]
    for video_path in video_paths:
        if not video_path.exists():
            raise ValueError(f"Chapter clip {video_path.name} not found")

    if combine_id in _in_flight:
        logger.info("combine %s is already generating — not starting a second run", combine_id)
        return combine_id, output_file

    error_path = EXPORT_DIR / f"{combine_id}.error"
    error_path.unlink(missing_ok=True)
    _in_flight.add(combine_id)

    task = asyncio.create_task(_run_combine(video_paths, combine_id, mp4_path, srt_path, error_path))
    _pending_tasks.add(task)
    task.add_done_callback(lambda t: (_pending_tasks.discard(t), _in_flight.discard(combine_id)))

    return combine_id, output_file


async def _run_combine(video_paths: list[Path], combine_id: str, mp4_path: Path, srt_path: Path, error_path: Path) -> None:
    """Concatenates the chapter clips via stream copy and merges their matching per-chapter srts
    (same base name, `.srt` alongside each `.mp4`). Renames into place srt first then mp4, same
    as `_run_export`, so a poller never sees a partial file.
    """
    logger.info("generating combine %s for %d chapter(s)", combine_id, len(video_paths))
    tmp_mp4 = mp4_path.with_suffix(".mp4.tmp")
    tmp_srt = srt_path.with_suffix(".srt.tmp")
    try:
        srt_paths = [video_path.with_suffix(".srt") for video_path in video_paths]
        _merge_srts(srt_paths, tmp_srt)
        await _concat_videos(video_paths, tmp_mp4)

        os.replace(tmp_srt, srt_path)
        os.replace(tmp_mp4, mp4_path)
        logger.info("combine generation complete: %s", mp4_path.name)
    except Exception as exc:  # noqa: BLE001 - reported to the polling caller via the error file, not raised
        logger.exception("combine generation failed for %s", combine_id)
        detail = exc.stderr.decode(errors="replace") if isinstance(exc, FFmpegError) and exc.stderr else str(exc)
        error_path.write_text(detail, encoding="utf-8")
        tmp_mp4.unlink(missing_ok=True)
        tmp_srt.unlink(missing_ok=True)
