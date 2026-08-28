# Phase 12 — Paper-crane deviation and recovery acceptance

## Status

Detector logic and replay fixtures implemented; physical and dataset acceptance pending.

## Implemented

- Added paper-boundary/four-corner validation and normalized geometry input.
- Added visibility, alignment, hand-occlusion, persistence, and expected-transition checks.
- Added approved-recovery-only intervention decisions.
- Added correct, delayed-correct, wrong-fold, uncertain, and approved-recovery fixtures.
- Added explicit metric reporting, including transition accuracy, intervention precision, false urgent rate, recovery selection, latency, replay determinism, and provenance linkage.

## Verification

- Required fixture scenarios pass deterministic replay tests.
- False urgent interventions reduce precision in the metric regression test.
- Physical acceptance requires the approved Golden Run, additional recordings, annotations, varied conditions, and a frozen holdout set.
