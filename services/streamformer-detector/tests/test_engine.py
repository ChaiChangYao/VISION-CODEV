from __future__ import annotations

import base64
import unittest

import numpy as np

from streamformer_detector.backends import StatisticalEmbeddingBackend
from streamformer_detector.contracts import DetectionRequest
from streamformer_detector.engine import DetectorConfig, TemporalChangeEngine


def request(sequence: int, value: int, stream_id: str = "run:0") -> DetectionRequest:
    rgba = bytes([value, value, value, 255]) * 4
    return DetectionRequest.from_json(
        {
            "contract": "vision-codef.change-detector-frame.v1",
            "streamId": stream_id,
            "sequence": sequence,
            "frame": {
                "width": 2,
                "height": 2,
                "pixelFormat": "rgba",
                "timestampMs": sequence * 100,
                "participantIdentity": "phone",
                "dataBase64": base64.b64encode(rgba).decode("ascii"),
            },
        }
    )


class AbruptEmbeddingBackend(StatisticalEmbeddingBackend):
    def encode(self, frames: np.ndarray) -> np.ndarray:
        latest_mean = float(frames[-1].mean())
        return np.array([1.0, 0.0] if latest_mean < 0 else [0.0, 1.0], dtype=np.float32)


class TemporalChangeEngineTest(unittest.TestCase):
    def test_warms_up_then_emits_one_change_event(self) -> None:
        engine = TemporalChangeEngine(
            AbruptEmbeddingBackend(),
            DetectorConfig(
                window_frames=2,
                inference_stride=1,
                threshold=0.2,
                consecutive_windows=2,
                smoothing=1,
                image_size=8,
            ),
        )
        results = [
            engine.observe(request(0, 0)),
            engine.observe(request(1, 0)),
            engine.observe(request(2, 255)),
            engine.observe(request(3, 255)),
            engine.observe(request(4, 255)),
        ]
        self.assertFalse(results[0]["changed"])
        self.assertEqual(results[0]["metadata"]["warmupFrames"], 1)
        self.assertEqual([result["changed"] for result in results], [False, False, False, True, False])

    def test_rejects_out_of_order_frames(self) -> None:
        engine = TemporalChangeEngine(
            StatisticalEmbeddingBackend(), DetectorConfig(window_frames=2, image_size=8)
        )
        engine.observe(request(1, 0))
        with self.assertRaisesRegex(ValueError, "sequence must increase"):
            engine.observe(request(1, 0))


if __name__ == "__main__":
    unittest.main()
