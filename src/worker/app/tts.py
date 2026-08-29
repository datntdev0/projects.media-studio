"""Loads a pool of VieNeu-TTS models once and serves inference off them.

The model load (weights + engine init) is the expensive part, so it happens once per pool
slot — at startup, or lazily on the first request if startup warmup failed — and the models
stay resident. Each inference call checks out an idle model for its duration and returns it
to the pool afterwards, so `settings.speech.pool_size` concurrent requests can run without
queuing behind a single model.
"""

import asyncio
import logging

import numpy as np
from vieneu import Vieneu

from .config import settings

logger = logging.getLogger(__name__)


class TTSEngine:
    def __init__(self) -> None:
        self._models: list[Vieneu] = []
        # Queue of pool indices (not model instances) so checkout/checkin can log which
        # instance handled a call — the thing we actually want to see when checking that
        # concurrent requests spread across the pool instead of serializing on one model.
        self._idle: asyncio.Queue[int] = asyncio.Queue()
        self._load_lock = asyncio.Lock()

    @property
    def sample_rate(self) -> int:
        return self._models[0].sample_rate if self._models else 48_000

    async def load(self) -> None:
        async with self._load_lock:
            if self._models:
                return
            pool_size = max(1, settings.speech.pool_size)
            logger.info("loading %d TTS model instance(s) (device=%s)", pool_size, settings.speech.device)
            for instance_id in range(pool_size):
                model = await asyncio.to_thread(Vieneu, device=settings.speech.device)
                self._models.append(model)
                self._idle.put_nowait(instance_id)
            logger.info("TTS model pool ready")

    async def _checkout(self) -> int:
        await self.load()
        instance_id = await self._idle.get()
        logger.debug("TTS instance #%d checked out (%d idle)", instance_id, self._idle.qsize())
        return instance_id

    def _checkin(self, instance_id: int) -> None:
        self._idle.put_nowait(instance_id)
        logger.debug("TTS instance #%d checked in (%d idle)", instance_id, self._idle.qsize())

    async def infer(self, text: str, voice: str) -> np.ndarray:
        instance_id = await self._checkout()
        try:
            logger.info("TTS instance #%d synthesizing 1 line", instance_id)
            return await asyncio.to_thread(self._models[instance_id].infer, text, voice=voice)
        finally:
            self._checkin(instance_id)

    async def infer_batch(self, texts: list[str], voice: str, batch_size: int) -> list[np.ndarray]:
        instance_id = await self._checkout()
        try:
            logger.info("TTS instance #%d synthesizing %d line(s)", instance_id, len(texts))
            return await asyncio.to_thread(self._models[instance_id].infer_batch, texts, voice=voice, batch_size=batch_size)
        finally:
            self._checkin(instance_id)


tts_engine = TTSEngine()
