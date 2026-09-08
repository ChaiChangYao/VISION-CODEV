# Media-plane contract

## Phone capture

The mobile client publishes one camera track and one microphone track to a company-scoped LiveKit room. Desktop monitoring and realtime AI data subscribe to that room. LiveKit Egress is the canonical server-side recorder and writes the primary media object to S3-compatible storage.

The mobile client may keep a bounded local rolling recovery buffer. It uploads recovery segments only when the server identifies a missing or corrupt Egress interval. Recovered media is reconciled by timestamp and checksum as a derived media version; the original Egress object remains unchanged.

## Guidance delivery

LiveKit is the source of truth for live guidance. A trusted realtime participant with
`attributes.role = guidance` may publish `speak` and `interrupt` JSON messages on the
`vision-codef.guidance` data topic. Phones with a configured on-device TTS model render those
messages locally through the active audio route; otherwise they subscribe to the guidance
participant's audio track. The phone never accepts guidance messages from an untrusted
participant or topic.

## Realtime observation boundary

The `services/realtime-guidance` worker joins the workflow room with a short-lived token from the
protected `/v1/internal/guidance-token` endpoint. It subscribes to phone camera frames, invokes a
provider-neutral VLM boundary, validates the result as a structured observation, and submits that
observation to the deployment API. The VLM is not allowed to author guidance.

Only the deterministic deployment decision may become a `speak` or `interrupt` packet. Invalid,
missing, or unavailable model output is converted to an uncertain observation and therefore fails
closed to an approved visibility request. Frame sampling is bounded and latest-frame-wins so stale
inference cannot build an unbounded guidance queue.

## CCTV and RTSP

RTSP sources are deferred until after the physical-device Golden Run gate. They terminate at MediaMTX. An explicitly managed bridge republishes MediaMTX output as WHIP, RTMP, HLS, or SRT into LiveKit Ingress when interactive monitoring is required. Direct RTSP-to-LiveKit Ingress is not assumed.

