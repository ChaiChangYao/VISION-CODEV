# Realtime guidance worker

This service closes the live loop between a phone camera and approved spoken guidance:

`LiveKit camera -> VLM observation -> deterministic API decision -> LiveKit guidance data`

The optional Golden Run path inserts a model-neutral change detector and bounded evidence buffer:

`LiveKit camera -> detector -> t-2s/t+1s evidence -> multimodal LLM -> decision -> local TTS`

The worker joins as a participant with `attributes.role = guidance`. It subscribes only to camera
tracks from participants whose role is `publisher`, samples frames at a configured interval, and
publishes only the API's deterministic `speak` or `interrupt` decision. Raw model text is never
sent to the phone.

## Required configuration

```text
API_URL=http://localhost:4000
NEXT_PUBLIC_COMPANY_ID=<company UUID>
NEXT_PUBLIC_MEMBER_ID=<member UUID>
VISION_CODEF_WORKFLOW_ID=<published workflow UUID>
VISION_CODEF_DEPLOYMENT_ID=<active deployment UUID>
VISION_CODEF_GUIDANCE_SERVICE_SECRET=<shared internal secret>
VISION_CODEF_GUIDANCE_FRAME_INTERVAL_MS=500
```

Set `VISION_CODEF_VLM_ENDPOINT` to use a provider-neutral HTTP inference service. That endpoint
receives an RGBA frame and must return the paper-crane observation contract. An optional
`VISION_CODEF_VLM_BEARER_TOKEN` is forwarded only to that configured endpoint.

Without an endpoint, the worker uses `VISION_CODEF_FIXTURE_OBSERVATION_JSON`. If neither is set,
it emits an occluded/uncertain observation. Fixture mode proves transport and decision wiring only;
it is not model evidence and must not be used for acceptance metrics.

## Change-triggered Golden Run mode

Set `VISION_CODEF_CHANGE_DETECTOR=frame-difference` to exercise the complete event path without
model weights. This baseline intentionally overreacts to POV camera motion; it exists to validate
buffering, thresholds, metrics, VLM calls, and TTS before adding GPU inference.

Set `VISION_CODEF_CHANGE_DETECTOR=http` and `VISION_CODEF_CHANGE_DETECTOR_ENDPOINT` to use
StreamFormer. The endpoint receives one stateful `vision-codef.change-detector-frame.v1` request per
sampled frame and returns `{ "score": 0.0, "changed": false }`. `modelId`, `modelVersion`, and scalar
metadata are optional. The adapter deliberately makes no StreamFormer assumptions, so ActionSwitch
or another detector can be compared later without changing the capture or guidance pipeline.

When `VISION_CODEF_EVENT_VLM_ENDPOINT` is set, a detected event is sent as
`vision-codef.change-event-observation.v1` with at most eight evenly spaced frames, detector
provenance, and the evidence window. Without it, the existing single-frame VLM is used as a
compatibility fallback.

`benchmarkDetectors` in `src/detectorBenchmark.ts` replays the same decoded frames through any
number of detector implementations. Given senior-labelled transition timestamps, it reports
precision, recall, F1, average latency, p95 latency, and trigger timestamps.

Spoken output remains a small trusted `speak`/`interrupt` data message. The phone renders it fully
on-device through Sherpa-ONNX and a local Piper/VITS model when `EXPO_PUBLIC_TTS_MODEL_PATH` is set;
no audio or text is sent to a cloud TTS provider.

Run the worker without hot reload because the LiveKit Node realtime SDK uses native WebRTC state:

```powershell
pnpm --filter @vision-codef/realtime-guidance dev
```

`@livekit/rtc-node` is currently marked Developer Preview by LiveKit. Keep the transport adapter
isolated and complete the physical-device gate before treating it as production-ready.
