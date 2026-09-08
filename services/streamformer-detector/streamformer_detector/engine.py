from __future__ import annotations

import base64
import binascii
import threading
from collections import OrderedDict, deque
from dataclasses import dataclass, field
import numpy as np
from PIL import Image

from .backends import EmbeddingBackend, normalize
from .contracts import DetectionRequest, FramePayload


@dataclass(frozen=True)
class DetectorConfig:
    window_frames: int = 16
    inference_stride: int = 2
    threshold: float = 0.08
    consecutive_windows: int = 2
    smoothing: float = 0.4
    reference_ema: float = 0.05
    image_size: int = 224
    max_streams: int = 8

    def __post_init__(self) -> None:
        if self.window_frames < 2:
            raise ValueError("window_frames must be at least 2")
        if self.inference_stride < 1:
            raise ValueError("inference_stride must be positive")
        if self.consecutive_windows < 1:
            raise ValueError("consecutive_windows must be positive")
        if not 0 <= self.threshold <= 1:
            raise ValueError("threshold must be between 0 and 1")
        if not 0 <= self.smoothing <= 1 or not 0 <= self.reference_ema <= 1:
            raise ValueError("smoothing and reference_ema must be between 0 and 1")


@dataclass
class StreamState:
    frames: deque[np.ndarray]
    reference: np.ndarray | None = None
    smoothed_score: float = 0
    above_threshold: int = 0
    frames_seen: int = 0
    inferences: int = 0
    last_score: float = 0
    last_sequence: int = -1
    lock: threading.Lock = field(default_factory=threading.Lock)


class TemporalChangeEngine:
    def __init__(self, backend: EmbeddingBackend, config: DetectorConfig | None = None) -> None:
        self.backend = backend
        self.config = config or DetectorConfig()
        self._streams: OrderedDict[str, StreamState] = OrderedDict()
        self._streams_lock = threading.Lock()

    def observe(self, request: DetectionRequest) -> dict[str, object]:
        state = self._state_for(request.stream_id)
        with state.lock:
            if request.sequence <= state.last_sequence:
                raise ValueError("sequence must increase within a stream")
            state.last_sequence = request.sequence
            state.frames.append(decode_frame(request.frame, self.config.image_size))
            state.frames_seen += 1
            warmup_remaining = max(0, self.config.window_frames - len(state.frames))
            if warmup_remaining > 0:
                return self._result(request, state, changed=False, warmup=warmup_remaining)
            if (state.frames_seen - self.config.window_frames) % self.config.inference_stride != 0:
                return self._result(request, state, changed=False, warmup=0, skipped=True)

            embedding = self.backend.encode(np.stack(tuple(state.frames)))
            state.inferences += 1
            if state.reference is None:
                state.reference = embedding
                return self._result(request, state, changed=False, warmup=0)

            raw_score = cosine_distance(state.reference, embedding)
            state.smoothed_score = (
                raw_score
                if state.inferences == 2
                else self.config.smoothing * raw_score
                + (1 - self.config.smoothing) * state.smoothed_score
            )
            state.last_score = state.smoothed_score
            state.above_threshold = (
                state.above_threshold + 1
                if state.smoothed_score >= self.config.threshold
                else 0
            )
            changed = state.above_threshold >= self.config.consecutive_windows
            if changed:
                state.reference = embedding
                state.above_threshold = 0
                state.smoothed_score = 0
            elif state.smoothed_score < self.config.threshold:
                state.reference = normalize(
                    (1 - self.config.reference_ema) * state.reference
                    + self.config.reference_ema * embedding
                )
            return self._result(
                request,
                state,
                changed=changed,
                warmup=0,
                raw_score=raw_score,
            )

    def health(self) -> dict[str, object]:
        return {
            "status": "ok",
            "backend": self.backend.model_id,
            "modelVersion": self.backend.model_version,
            "device": self.backend.device,
            "windowFrames": self.config.window_frames,
            "activeStreams": len(self._streams),
        }

    def _state_for(self, stream_id: str) -> StreamState:
        with self._streams_lock:
            existing = self._streams.pop(stream_id, None)
            if existing is not None:
                self._streams[stream_id] = existing
                return existing
            while len(self._streams) >= self.config.max_streams:
                self._streams.popitem(last=False)
            state = StreamState(frames=deque(maxlen=self.config.window_frames))
            self._streams[stream_id] = state
            return state

    def _result(
        self,
        request: DetectionRequest,
        state: StreamState,
        *,
        changed: bool,
        warmup: int,
        skipped: bool = False,
        raw_score: float = 0,
    ) -> dict[str, object]:
        return {
            "score": float(state.last_score),
            "changed": changed,
            "modelId": self.backend.model_id,
            "modelVersion": self.backend.model_version,
            "metadata": {
                "device": self.backend.device,
                "warmupFrames": warmup,
                "windowFrames": self.config.window_frames,
                "inferenceStride": self.config.inference_stride,
                "inferences": state.inferences,
                "rawScore": float(raw_score),
                "skippedInference": skipped,
                "sequence": request.sequence,
            },
        }


def decode_frame(frame: FramePayload, image_size: int) -> np.ndarray:
    try:
        raw = base64.b64decode(frame.data_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("frame.dataBase64 is not valid base64") from error
    expected = frame.width * frame.height * 4
    if len(raw) != expected:
        raise ValueError(f"RGBA frame has {len(raw)} bytes; expected {expected}")
    rgba = Image.frombytes("RGBA", (frame.width, frame.height), raw).convert("RGB")
    resized = rgba.resize((image_size, image_size), Image.Resampling.BICUBIC)
    values = np.asarray(resized, dtype=np.float32) / 255.0
    # SigLIP preprocessing maps [0, 1] to [-1, 1].
    values = (values - 0.5) / 0.5
    return np.transpose(values, (2, 0, 1)).copy()
def cosine_distance(left: np.ndarray, right: np.ndarray) -> float:
    left = normalize(left)
    right = normalize(right)
    return float(np.clip((1 - np.dot(left, right)) / 2, 0, 1))
