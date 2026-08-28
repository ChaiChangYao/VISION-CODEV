# Vision Codef release-gate status

This is the coordinator’s current acceptance record. A local fixture or unit
test does not pass a gate that explicitly requires physical hardware, an
external provider, or representative evaluation data.

| Gate | Status | Evidence or blocker |
| --- | --- | --- |
| Repository, ADR, ownership, and v0.1 contracts | PASS | `docs/adr/0001-system-foundation.md`, shared contracts, and isolated Wave 1 integration history |
| Company isolation and signed request boundary | IMPLEMENTED / RUNTIME PENDING | PostgreSQL RLS migrations, tenant repositories, membership checks, and auth tests; live Postgres isolation test requires the compose stack |
| Compiled API runtime | PASS | `node apps/api/dist/server.js` answered `/health` after `pnpm build` |
| Local Golden Run API journey | PASS | `scripts/verify-golden-run.mjs` covers workflow, reviewed publication, voice transitions, wrong-fold persistence, intervention, and approved recovery |
| Physical phone pairing and LiveKit camera/audio | BLOCKED | Requires one real Android or iPhone, Bluetooth headset, reachable LiveKit, and current Chrome; no simulated success is accepted |
| Canonical Egress media persistence | BLOCKED | Requires configured LiveKit Egress and S3-compatible storage, plus a real capture object/checksum |
| Durable Temporal processing | IMPLEMENTED / RUNTIME PENDING | Worker, idempotent completion sink, and processing contracts exist; Temporal and provider/model credentials are unavailable locally |
| Paper-crane fixture engine and deterministic replay | PASS | Engine tests and fixture evaluation cover correct, delayed, wrong-fold, uncertain, and approved-recovery cases |
| Paper-crane dataset acceptance | BLOCKED | Requires approved Golden Run, 10–20 additional correct recordings, selected-deviation recordings, annotations, varied conditions, and frozen holdout data |
| External email/webhook delivery | BLOCKED | No provider credentials or sandbox delivery evidence supplied |
| Secondary CCTV, RTSP, ONVIF, MediaMTX, and Camera Automation | DEFERRED | Must not begin until the physical-device Golden Run gate passes |

## Required next evidence

1. Start the first-slice compose services and run the migration, seed, and live
   repository-isolation tests.
2. Build a physical development client (Expo Go is not an acceptance
   environment), pair one phone and Bluetooth headset, and collect the
   evidence listed in `apps/mobile/docs/PHYSICAL_DEVICE_TESTING.md`.
3. Configure LiveKit Egress, S3-compatible storage, Temporal, and the pinned
   processing metadata; rerun the same journey with the real media object.
4. Freeze the paper-crane acceptance set and report raw trial counts plus the
   required transition/intervention/recovery metrics.
