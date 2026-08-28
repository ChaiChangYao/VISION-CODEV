# Phase 03 — Company isolation, authentication, and persistence

## Status

Implemented locally; live PostgreSQL runtime verification pending.

## Implemented

- Added `TenantContext` propagation and authenticated company membership checks.
- Added PostgreSQL Row Level Security with forced tenant policies.
- Added company-bearing composite foreign keys where practical.
- Added tenant-bound repositories with no unrestricted entity lookup.
- Added API runtime persistence and cross-company negative tests.

## Verification

- Authentication, membership, tenant-context, repository, and persistence tests pass.
- The live RLS isolation test remains dependent on the first-slice compose stack.

## Gate note

No production isolation claim is made until the migration, seed, and live PostgreSQL isolation test run successfully.
