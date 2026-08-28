# Phase 07 — Golden Run Train capture

## Status

Implemented locally; synchronized physical capture validation pending.

## Implemented

- Added the Train surface with capture preparation, pairing-code display, phone claim state, start/stop controls, and desktop monitoring.
- Added runtime pairing-code entry in the native app.
- Added capture-session and media-plane event contracts.

## Verification

- Web and mobile typechecks, tests, and builds pass.
- The API verifier covers capture preparation and rejects start before phone claim.
- A synchronized real phone timeline requires the Phase 4 physical media gate.
