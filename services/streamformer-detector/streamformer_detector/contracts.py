from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FramePayload:
    width: int
    height: int
    timestamp_ms: int
    participant_identity: str
    data_base64: str

    @classmethod
    def from_request(cls, value: Any) -> "FramePayload":
        if not isinstance(value, dict):
            raise ValueError("frame must be an object")
        if value.get("pixelFormat") != "rgba":
            raise ValueError("frame.pixelFormat must be rgba")
        width = positive_integer(value.get("width"), "frame.width")
        height = positive_integer(value.get("height"), "frame.height")
        timestamp_ms = nonnegative_integer(value.get("timestampMs"), "frame.timestampMs")
        participant_identity = nonempty_string(
            value.get("participantIdentity"), "frame.participantIdentity"
        )
        data_base64 = nonempty_string(value.get("dataBase64"), "frame.dataBase64")
        return cls(width, height, timestamp_ms, participant_identity, data_base64)


@dataclass(frozen=True)
class DetectionRequest:
    stream_id: str
    sequence: int
    frame: FramePayload

    @classmethod
    def from_json(cls, value: Any) -> "DetectionRequest":
        if not isinstance(value, dict):
            raise ValueError("request body must be an object")
        if value.get("contract") != "vision-codef.change-detector-frame.v1":
            raise ValueError("unsupported contract")
        return cls(
            stream_id=nonempty_string(value.get("streamId"), "streamId"),
            sequence=nonnegative_integer(value.get("sequence"), "sequence"),
            frame=FramePayload.from_request(value.get("frame")),
        )


def nonempty_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return value.strip()


def positive_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


def nonnegative_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return value
