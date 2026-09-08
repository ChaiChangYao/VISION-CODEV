# StreamFormer change detector

Stateful HTTP sidecar for the realtime-guidance `ChangeDetector` contract. It keeps a 16-frame
window per stream, extracts StreamFormer’s last-frame temporal representation, compares it with a
slowly adapting stable reference, and emits a one-shot change event after a sustained embedding
shift.

The published `StreamFormer/streamformer-timesformer` weights are licensed CC BY-NC 4.0. Use this
sidecar for non-commercial Golden Run research only unless separately licensed. The weights are not
vendored or committed.

## Fast contract smoke test

The statistical backend uses only Python, NumPy, and Pillow and exercises the identical HTTP path:

```powershell
cd services/streamformer-detector
$env:STREAMFORMER_BACKEND='statistical'
python -m streamformer_detector.server
```

## Install the actual model

The official project targets Python 3.10 and PyTorch 2.5.1. This setup uses the installed Python
3.11 runtime, creates an isolated `.venv`, downloads CPU PyTorch, and clones the official model code
under the ignored `vendor` directory:

```powershell
cd services/streamformer-detector
.\scripts\setup.ps1 -Device cpu
.\scripts\start.ps1 -Backend streamformer
```

The current development machine has an MX450 with 2 GB VRAM and an old driver. CPU is therefore the
safe default. For a deployment machine with at least 4 GB free CUDA memory and a compatible driver,
run setup with `-Device cuda`; auto-selection still falls back to CPU when free memory is too low.

The first model start downloads the 521 MB checkpoint from Hugging Face. Pin
`STREAMFORMER_MODEL_VERSION` to an immutable commit before collecting benchmark results.

## Realtime-guidance configuration

Use an approximately 8 FPS sampled stream so the 16-frame model window covers about two seconds:

```env
VISION_CODEF_GUIDANCE_FRAME_INTERVAL_MS=125
VISION_CODEF_CHANGE_DETECTOR=http
VISION_CODEF_CHANGE_DETECTOR_ENDPOINT=http://127.0.0.1:8091/detect
VISION_CODEF_CHANGE_DETECTOR_MODEL_ID=streamformer
VISION_CODEF_CHANGE_DETECTOR_MODEL_VERSION=main
```

Useful detector settings:

```env
STREAMFORMER_DEVICE=auto
STREAMFORMER_WINDOW_FRAMES=16
STREAMFORMER_INFERENCE_STRIDE=2
STREAMFORMER_CHANGE_THRESHOLD=0.08
STREAMFORMER_CONSECUTIVE_WINDOWS=2
STREAMFORMER_SCORE_SMOOTHING=0.4
STREAMFORMER_REFERENCE_EMA=0.05
```

Run dependency-light tests with:

```powershell
python -m unittest discover -s tests -v
```
