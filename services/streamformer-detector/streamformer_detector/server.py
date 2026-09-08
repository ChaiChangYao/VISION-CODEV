from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .backends import create_backend, integer_env
from .contracts import DetectionRequest
from .engine import DetectorConfig, TemporalChangeEngine


def create_engine() -> TemporalChangeEngine:
    return TemporalChangeEngine(
        create_backend(),
        DetectorConfig(
            window_frames=integer_env("STREAMFORMER_WINDOW_FRAMES", 16),
            inference_stride=integer_env("STREAMFORMER_INFERENCE_STRIDE", 2),
            threshold=float(os.environ.get("STREAMFORMER_CHANGE_THRESHOLD", "0.08")),
            consecutive_windows=integer_env("STREAMFORMER_CONSECUTIVE_WINDOWS", 2),
            smoothing=float(os.environ.get("STREAMFORMER_SCORE_SMOOTHING", "0.4")),
            reference_ema=float(os.environ.get("STREAMFORMER_REFERENCE_EMA", "0.05")),
            max_streams=integer_env("STREAMFORMER_MAX_STREAMS", 8),
        ),
    )


def handler_for(engine: TemporalChangeEngine) -> type[BaseHTTPRequestHandler]:
    class DetectorHandler(BaseHTTPRequestHandler):
        server_version = "VisionCodefStreamFormer/1"

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self._json(HTTPStatus.OK, engine.health())
                return
            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/detect":
                self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            try:
                length = int(self.headers.get("content-length", "0"))
                if length <= 0 or length > 20 * 1024 * 1024:
                    raise ValueError("request body size is invalid")
                payload = json.loads(self.rfile.read(length))
                request = DetectionRequest.from_json(payload)
                self._json(HTTPStatus.OK, engine.observe(request))
            except (ValueError, json.JSONDecodeError) as error:
                self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            except Exception as error:  # Keep the stream client alive but fail visibly.
                self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})

        def log_message(self, format: str, *args: Any) -> None:
            print(f"streamformer-detector: {format % args}")

        def _json(self, status: HTTPStatus, value: dict[str, object]) -> None:
            encoded = json.dumps(value, separators=(",", ":")).encode("utf-8")
            self.send_response(status.value)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    return DetectorHandler


def main() -> None:
    host = os.environ.get("STREAMFORMER_HOST", "127.0.0.1")
    port = integer_env("STREAMFORMER_PORT", 8091)
    engine = create_engine()
    server = ThreadingHTTPServer((host, port), handler_for(engine))
    print(
        f"StreamFormer detector listening on http://{host}:{port} "
        f"({engine.backend.model_id} on {engine.backend.device})."
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
