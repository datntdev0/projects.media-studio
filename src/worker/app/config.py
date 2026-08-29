"""Runtime settings, loaded from config.json next to this package.

The browser options a caller can override per request live on `FetchOptions` instead.
"""

import os
from pathlib import Path

from .models import CamelModel

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"


class ScraperSettings(CamelModel):
    # Tabs the browser may keep open at once; also caps concurrent scrapes.
    max_pages: int = 4
    # Rebuild the browser when it has been unused this long, so a stale Cloudflare
    # clearance cookie cannot wedge every later request.
    idle_restart_seconds: int = 900


class ExportSettings(CamelModel):
    # ffmpeg video encoder /export muxes narration+image into an mp4 with. "libx264" (CPU,
    # default) or a hardware encoder available on this machine, e.g. "h264_nvenc" (NVIDIA),
    # "h264_amf" (AMD), "h264_qsv" (Intel Quick Sync) — must be one `ffmpeg -encoders` lists.
    video_codec: str = "libx264"


class SpeechSettings(CamelModel):
    # Device the TTS model runs inference on, e.g. "cpu" or "cuda".
    device: str = "cpu"
    # Where the TTS model weights are downloaded/cached, relative to appDir.
    models_dir: str = "models"
    # How many lines the engine groups into one forward pass — bigger batches amortize model
    # overhead (most useful on GPU; the CPU/ONNX backend still runs them sequentially).
    batch_size: int = 8
    # How many model instances to load at startup. Each concurrent speech request holds one
    # instance for its duration, so a larger pool lets more requests run at once instead of
    # queuing behind a single model.
    pool_size: int = 1


class Settings(CamelModel):
    # Base directory (relative to this file's project root) for the worker's own
    # runtime data: the persisted browser profile and generated speech files.
    app_dir: str = "data"
    scraper: ScraperSettings = ScraperSettings()
    speech: SpeechSettings = SpeechSettings()
    export: ExportSettings = ExportSettings()

    @property
    def app_dir_path(self) -> Path:
        return CONFIG_PATH.parent / self.app_dir

    @property
    def models_dir_path(self) -> Path:
        return self.app_dir_path / self.speech.models_dir


def _load_settings() -> Settings:
    if CONFIG_PATH.is_file():
        return Settings.model_validate_json(CONFIG_PATH.read_text(encoding="utf-8"))
    return Settings()


settings = _load_settings()

# huggingface_hub reads HF_HOME once, at its own import time, so this must run before
# anything imports it (vieneu does, transitively) — config.py is loaded first for that reason.
settings.models_dir_path.mkdir(parents=True, exist_ok=True)
os.environ["HF_HOME"] = str(settings.models_dir_path)
