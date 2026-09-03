"""One loaded VieNeu-TTS model, reading a list of lines into a single waveform."""

import os
from pathlib import Path

import numpy as np
import soundfile as sf

from core.helpers import DATA_DIR

# huggingface_hub reads HF_HOME once, when imported, and vieneu imports it — so this comes before that import.
MODELS_DIR = DATA_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
os.environ["HF_HOME"] = str(MODELS_DIR)

from vieneu import Vieneu  # noqa: E402

# Silence laid between two lines' clips, so consecutive sentences do not run into each other.
LINE_GAP_SECONDS = 0.3


class Speaker:
    """Owns one model instance; `read` synthesizes a whole file's lines in one batch call."""

    def __init__(self, device: str, batch_size: int) -> None:
        self.model = Vieneu(device=device, max_batch_size=batch_size)
        self.sample_rate: int = self.model.sample_rate

    def voices(self) -> list[str]:
        return [name for _, name in self.model.list_preset_voices()]

    def read(self, lines: list[str], voice: str) -> tuple[np.ndarray, list[tuple[float, float]]]:
        """The lines spoken back to back, and where each one starts and ends in the result."""
        clips = self.model.infer_batch(lines, voice=voice)
        gap = np.zeros(round(LINE_GAP_SECONDS * self.sample_rate), dtype=np.float32)

        parts: list[np.ndarray] = []
        spans: list[tuple[float, float]] = []
        cursor = 0.0
        for clip in clips:
            duration = len(clip) / self.sample_rate
            spans.append((cursor, cursor + duration))
            parts.extend((clip.astype(np.float32), gap))
            cursor += duration + LINE_GAP_SECONDS

        return np.concatenate(parts[:-1]), spans

    def save(self, audio: np.ndarray, path: Path) -> None:
        sf.write(str(path), audio, self.sample_rate, format="WAV")
