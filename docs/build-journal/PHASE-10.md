# Phase 10 — Validation, approval, and immutable publication

## Status

Complete for the local demonstrator.

## Implemented

- Added deterministic graph validation and normalization before publication.
- Added reviewer approval requirements and immutable published versions.
- Added provenance-backed deployment instructions and `Why?` responses.
- Added rejection of unsupported model-only publication provenance.

## Verification

- Workflow-engine publication and provenance tests pass.
- The compiled Golden Run verifier publishes a graph, starts deployment, and confirms the `Why?` response links to `PUBLISHED_REQUIREMENT` provenance.
