# ADR-0001: System foundation

## Status

Accepted

## Context

Vision Codef starts from an empty repository. The product must preserve an automotive-oriented domain while proving a narrow physical-device Golden Run demonstrator first.

## Decisions

1. Use a pnpm workspace with Turborepo and separate web, mobile, API, worker, Python service, and shared package boundaries.
2. Use LiveKit for phone WebRTC, audio, desktop monitoring, realtime data, and AI instructions. MediaMTX is reserved for RTSP/CCTV protocol normalization after the physical Golden Run gate.
3. Use S3-compatible storage as canonical media storage. LiveKit Egress is the canonical phone recording path; bounded mobile recovery buffers are only reconciled when Egress gaps are detected.
4. Use PostgreSQL as the tenant-scoped system of record, with Row Level Security and repository-level `TenantContext` enforcement.
5. Use Temporal for durable, resumable processing workflows, not frame-by-frame realtime deployment decisions.
6. Use version-pinned, replayable model outputs followed by deterministic procedure graph validation, normalization, execution, and publication.
7. Company members have equal product capabilities; membership authorization is required but role/RBAC distinctions are not implemented.
8. Shared contracts are versioned at `v0.1` before parallel agent implementation.

## Consequences

The initial build favors a narrow real-device vertical slice over broad adapter coverage. Missing credentials, hardware, or evaluation data produce explicit blocked gates rather than simulated success.

