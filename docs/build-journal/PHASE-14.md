# Phase 14 — Edge connectors, MediaMTX, RTSP, ONVIF, and integrations

## Status

Deferred.

## Decision

No RTSP, ONVIF, MediaMTX, edge-connector, or Camera Automation implementation begins before the physical-device Golden Run gate passes. The media-plane boundary is documented: CCTV terminates at MediaMTX and enters LiveKit only through an explicitly managed WHIP, RTMP, HLS, or SRT bridge.
