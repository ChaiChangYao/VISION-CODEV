from __future__ import annotations

import os
import sys
import threading
from pathlib import Path
from typing import Protocol

import numpy as np


class EmbeddingBackend(Protocol):
    model_id: str
    model_version: str
    device: str

    def encode(self, frames: np.ndarray) -> np.ndarray:
        """Encode [T, C, H, W] float32 frames into one normalized vector."""


class StatisticalEmbeddingBackend:
    """Deterministic, dependency-light backend for CI and contract smoke tests."""

    model_id = "statistical-temporal-baseline"
    model_version = "1"
    device = "cpu"

    def encode(self, frames: np.ndarray) -> np.ndarray:
        latest = frames[-1]
        channel_mean = latest.mean(axis=(1, 2))
        channel_std = latest.std(axis=(1, 2))
        temporal_delta = np.abs(np.diff(frames, axis=0)).mean(axis=(0, 2, 3))
        feature = np.concatenate([channel_mean, channel_std, temporal_delta]).astype(np.float32)
        return normalize(feature)


class StreamFormerEmbeddingBackend:
    model_id: str
    model_version: str
    device: str

    def __init__(
        self,
        repository_path: Path,
        model_id: str = "StreamFormer/streamformer-timesformer",
        model_version: str = "main",
        device: str = "auto",
        minimum_cuda_memory_mb: int = 4096,
        local_files_only: bool = False,
    ) -> None:
        if not repository_path.is_dir():
            raise RuntimeError(
                f"StreamFormer repository not found at {repository_path}. Run scripts/setup.ps1."
            )
        sys.path.insert(0, str(repository_path.resolve()))
        try:
            import torch
            from models import TimesformerMultiTaskingModelSigLIP
        except ImportError as error:
            raise RuntimeError(
                "StreamFormer dependencies are missing. Activate the service .venv and run setup.ps1."
            ) from error

        self._torch = torch
        self.device = select_device(torch, device, minimum_cuda_memory_mb)
        self.model_id = model_id
        self.model_version = model_version
        self._lock = threading.Lock()
        self._model = TimesformerMultiTaskingModelSigLIP.from_pretrained(
            model_id,
            revision=model_version,
            local_files_only=local_files_only,
        ).eval()
        self._model.to(self.device)
        if self.device == "cuda":
            self._model.half()

    def encode(self, frames: np.ndarray) -> np.ndarray:
        torch = self._torch
        tensor = torch.from_numpy(np.ascontiguousarray(frames)).unsqueeze(0)
        tensor = tensor.to(self.device)
        if self.device == "cuda":
            tensor = tensor.half()
        with self._lock, torch.inference_mode():
            output = self._model(tensor)
            embedding = output.pooler_output[:, -1, :].float().cpu().numpy()[0]
        return normalize(embedding.astype(np.float32))


def create_backend() -> EmbeddingBackend:
    backend = os.environ.get("STREAMFORMER_BACKEND", "streamformer").strip().lower()
    if backend == "statistical":
        return StatisticalEmbeddingBackend()
    if backend != "streamformer":
        raise RuntimeError("STREAMFORMER_BACKEND must be streamformer or statistical")
    service_root = Path(__file__).resolve().parents[1]
    repository_path = Path(
        os.environ.get(
            "STREAMFORMER_REPO_PATH", str(service_root / "vendor" / "StreamFormer")
        )
    )
    return StreamFormerEmbeddingBackend(
        repository_path=repository_path,
        model_id=os.environ.get(
            "STREAMFORMER_MODEL_ID", "StreamFormer/streamformer-timesformer"
        ),
        model_version=os.environ.get("STREAMFORMER_MODEL_VERSION", "main"),
        device=os.environ.get("STREAMFORMER_DEVICE", "auto"),
        minimum_cuda_memory_mb=integer_env("STREAMFORMER_MIN_CUDA_MEMORY_MB", 4096),
        local_files_only=boolean_env("STREAMFORMER_LOCAL_FILES_ONLY", False),
    )


def select_device(torch: object, requested: str, minimum_cuda_memory_mb: int) -> str:
    requested = requested.strip().lower()
    if requested not in {"auto", "cpu", "cuda"}:
        raise RuntimeError("STREAMFORMER_DEVICE must be auto, cpu, or cuda")
    cuda = getattr(torch, "cuda")
    if requested == "cpu":
        return "cpu"
    if not cuda.is_available():
        if requested == "cuda":
            raise RuntimeError("CUDA was requested but PyTorch cannot access it")
        return "cpu"
    free_bytes, _ = cuda.mem_get_info()
    enough_memory = free_bytes >= minimum_cuda_memory_mb * 1024 * 1024
    if requested == "cuda" and not enough_memory:
        raise RuntimeError(
            f"CUDA has only {free_bytes // (1024 * 1024)} MB free; "
            f"{minimum_cuda_memory_mb} MB is required"
        )
    return "cuda" if enough_memory else "cpu"


def normalize(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector if norm == 0 else vector / norm


def integer_env(name: str, fallback: int) -> int:
    try:
        return int(os.environ.get(name, str(fallback)))
    except ValueError:
        return fallback


def boolean_env(name: str, fallback: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return fallback
    return value.strip().lower() in {"1", "true", "yes", "on"}
