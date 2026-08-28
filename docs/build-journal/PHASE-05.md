# Phase 05 — Capture persistence, recovery, and desktop monitoring

## Status

Implemented locally; physical/provider verification pending.

## Implemented

- Made LiveKit Egress the canonical server-side recording path.
- Added capture and media-asset lifecycle state handling.
- Added bounded mobile rolling recovery buffering.
- Added timestamp/checksum-oriented recovery contracts without a competing canonical upload.
- Added company-scoped desktop monitor token issuance.

## Verification

- Mobile lifecycle and recovery-buffer tests pass.
- The compiled API and web monitor build successfully.
- Real track subscription, Egress completion, object checksum, and recovery reconciliation require hardware and configured services.

## Gate note

The original Egress object must remain preserved when a server-requested recovery segment is reconciled; this has not been claimed without a real media object.
