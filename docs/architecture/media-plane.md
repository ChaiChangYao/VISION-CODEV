# Media-plane contract

## Phone capture

The mobile client publishes one camera track and one microphone track to a company-scoped LiveKit room. Desktop monitoring and realtime AI data subscribe to that room. LiveKit Egress is the canonical server-side recorder and writes the primary media object to S3-compatible storage.

The mobile client may keep a bounded local rolling recovery buffer. It uploads recovery segments only when the server identifies a missing or corrupt Egress interval. Recovered media is reconciled by timestamp and checksum as a derived media version; the original Egress object remains unchanged.

## CCTV and RTSP

RTSP sources are deferred until after the physical-device Golden Run gate. They terminate at MediaMTX. An explicitly managed bridge republishes MediaMTX output as WHIP, RTMP, HLS, or SRT into LiveKit Ingress when interactive monitoring is required. Direct RTSP-to-LiveKit Ingress is not assumed.

