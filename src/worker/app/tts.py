"""Loads the VieNeu-TTS model once and serves inference off it.

The model load (weights + engine init) is the expensive part, so it happens once —
at startup, or lazily on the first request if startup warmup failed — and the model
stays resident; each call to `infer` only pays for synthesis.
"""

import asyncio
import logging

import numpy as np
from vieneu import Vieneu

from .config import settings

logger = logging.getLogger(__name__)


class TTSEngine:
    def __init__(self) -> None:
        self._model: Vieneu | None = None
        self._lock = asyncio.Lock()

    @property
    def sample_rate(self) -> int:
        return self._model.sample_rate if self._model else 48_000

    async def load(self) -> None:
        async with self._lock:
            if self._model is None:
                logger.info("loading TTS model (device=%s)", settings.speech.device)
                self._model = await asyncio.to_thread(Vieneu, device=settings.speech.device)
                logger.info("TTS model ready")

    async def infer(self, text: str, voice: str) -> np.ndarray:
        await self.load()
        return await asyncio.to_thread(self._model.infer, text, voice=voice)


tts_engine = TTSEngine()
