# Phase 11 — Deployment guidance and voice state

## Status

Implemented locally; physical realtime acceptance remains pending.

## Implemented

- Added versioned `VoiceState` and `VoiceEvent` schemas to the shared v0.1
  contracts.
- Added a deterministic workflow-engine voice reducer for open, guidance,
  interrupt, acknowledgement, mute, failure, and close transitions.
- Persisted deployment voice state alongside paper-crane state and approved
  recovery intervention.
- Added a tenant-scoped deployment voice transition endpoint:
  `POST /v1/deployments/:deploymentId/voice`.
- Exposed voice state through the web deployment client and surface.

## Verification

- Workflow-engine voice reducer tests: passed.
- Compiled API Golden Run verifier: passed through voice transitions, wrong-fold
  interruption, approved recovery, and completion.
- Actual speech recognition, synthesis, and physical LiveKit data-channel
  behavior remain part of the physical/provider acceptance gate; no simulated
  voice success is claimed.
