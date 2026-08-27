# Phase 04 — Scoped LiveKit capture checkpoint

## Implemented

- API issues short-lived publisher and viewer tokens only after company/member/session ownership checks.
- API starts and stops LiveKit Room Composite Egress only when explicit S3-compatible output configuration is present; otherwise the asset is marked `pending` and the capture remains visibly blocked.
- LiveKit room names and token identities are company-scoped.
- Mobile token requests send the authenticated company/member context; the app publishes camera and microphone tracks only while the active foreground capture session is running.
- Backgrounding pauses capture, disconnects silently, and reconnects when the app returns to the foreground.
- The bounded mobile recovery buffer remains a gap-recovery mechanism; LiveKit Egress remains the canonical server recording path.
- The desktop train surface now requests a viewer token and subscribes to the room with the browser LiveKit SDK. No media is fabricated when the room or tracks are unavailable.

## Verification

- `pnpm typecheck`: passed across all 12 workspaces.
- `pnpm test`: passed across all 12 workspaces.
- `pnpm build`: passed, including the Next.js browser monitor bundle.
- `pnpm lint`: passed across all 12 workspaces.
- Canonical Egress configuration tests: passed without contacting an external provider.

## Gate status

The physical-device Golden Run gate remains unclaimed. It still requires one real phone, one Bluetooth headset, a reachable LiveKit deployment, a canonical Egress object, and a current Chrome monitor session. Missing credentials or hardware must remain an explicit blocker, never simulated success.
