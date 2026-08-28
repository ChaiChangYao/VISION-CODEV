# Physical Golden Run readiness checklist

Use this checklist before attempting the Phase 4 physical-device gate. Do not paste credentials, access tokens, or private media into Git or chat.

## Minimum Phase 4 kit

- One physical Android phone or iPhone. Android is the recommended first path from a Windows development machine.
- One Bluetooth headset with a working microphone.
- Rear camera and one stable mounted orientation.
- A desktop running current stable Chrome on the same LAN as the phone.
- Paper, a flat work surface, and a repeatable paper-crane setup visible to the rear camera.
- A USB cable. Android also needs USB debugging and an installed Android SDK/device driver. iOS requires a Mac/Xcode signing path or an approved cloud development-build path.

## Local services and configuration

Choose one path and record it in the local, uncommitted `.env` file:

1. Local services: Docker Desktop running the first-slice Compose stack, with PostgreSQL, Redis, Qdrant, MinIO, Temporal, LiveKit Server, and LiveKit Egress healthy.
2. Managed services: reachable LiveKit, S3-compatible storage, Temporal, and processing-provider endpoints with credentials supplied through environment variables.

The phone must not use `localhost`. Set the mobile API and LiveKit URLs to a LAN-reachable development-machine address or an approved tunnel. The API must have:

- `EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT`
- `EXPO_PUBLIC_CAPTURE_PAIRING_ENDPOINT`
- `EXPO_PUBLIC_COMPANY_ID`
- `EXPO_PUBLIC_MEMBER_ID`
- `EXPO_PUBLIC_DEVICE_ID`
- `EXPO_PUBLIC_LIVEKIT_URL`

The desktop web app must use a reachable `NEXT_PUBLIC_API_BASE_URL`. LiveKit Egress must be configured to send signed completion webhooks to `/v1/webhooks/livekit` and write the canonical object to S3-compatible storage.

## Dataset required before paper-crane acceptance

The first Golden Run video can seed an initial draft, but it cannot prove detector reliability by itself. Prepare:

- One approved Golden Run recording and its reviewer-approved procedure.
- 10–20 additional correct execution recordings.
- At least five recordings for each selected wrong-fold deviation.
- Portrait and landscape samples, varied lighting, and hand-occlusion cases.
- Frame or segment annotations for paper boundary, four corners, fold state, visibility, alignment, occlusion, expected transition, and intervention label.
- Participant-disjoint evaluation when multiple participants are available.
- A frozen acceptance set excluded from tuning.

Keep original media, sanitized event traces, annotations, and checksums together outside Git or in approved object storage. Record only references in the repository acceptance report.

## What to send back

Reply with:

1. Platform: Android or iPhone; phone model and OS version.
2. Headset: Bluetooth model; wired headset availability.
3. Build path: Android SDK/USB debugging, or iOS Mac/Xcode/cloud build.
4. Network path: same-LAN access or approved tunnel; never send secrets.
5. Service path: local Docker Desktop or reachable managed services.
6. Dataset inventory: number of correct, wrong-fold, occluded, portrait, and landscape recordings.

Once those prerequisites are available, run `node apps/mobile/scripts/device-acceptance.mjs init --phase 4 --out <report.json>` and attach evidence references to the generated report. A report may be marked `BLOCKED`; it must not claim `PASS` without physical evidence.
