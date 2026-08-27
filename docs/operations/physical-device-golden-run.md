# Physical-device Golden Run verification

## Phase 4 gate

Use one physical Android phone or iPhone, one Bluetooth headset, the rear camera, one mounted orientation, and current stable Chrome. Build the mobile app with `pnpm --filter @vision-codef/mobile prebuild` followed by the platform development build; Expo Go is not an acceptance environment.

Configure `EXPO_PUBLIC_LIVEKIT_URL`, `EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT`, company/member/workflow/session IDs, and a reachable API. Confirm the app stays foregrounded and the screen stays awake during capture.

Configure LiveKit to send signed Egress webhooks to `/v1/webhooks/livekit`. The API marks the canonical asset available and submits Temporal processing only after a verified `egress_ended` completion; stopping Egress alone is not proof that the object is persisted.

## Evidence to collect

1. A workflow creation response and workflow ID.
2. Mobile permission and device readiness screenshots.
3. LiveKit room participant/track evidence for camera and Bluetooth microphone.
4. Desktop browser video and connection-health evidence.
5. Egress recording object ID, checksum, and duration.
6. Capture finalization and processing events.
7. Editable graph draft and reviewer publication event.
8. Deployment run with one correct transition, one wrong-fold intervention, and one approved recovery.
9. Completion report containing deviation and recovery history.

Missing LiveKit credentials, external provider credentials, hardware, or evaluation recordings must be recorded as explicit blocked gates. They must never be replaced with simulated green success.
