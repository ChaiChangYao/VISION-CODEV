# Phase 04 — Physical phone and LiveKit media proof

## Coordinator checkpoint

The repository now contains the Expo prebuild mobile foundation, native LiveKit dependencies, foreground capture lifecycle, Bluetooth/interrupt recovery primitives, bounded rolling recovery buffer, and the connected web/API capture journey.

The API deliberately reports `connecting`/`pending` when LiveKit credentials and a real publisher are unavailable. LiveKit Egress remains the intended canonical recording path; no second canonical mobile upload is created.

## Verification

- `pnpm typecheck`: passed across all 12 workspaces.
- `pnpm test`: passed across all 12 workspaces; API paper-crane boundary tests included.
- `pnpm lint`: passed across all 12 workspaces.
- `pnpm build`: passed, including Next.js workflow routes.
- Local API journey: workflow creation, graph publication, deployment, persisted wrong-fold observation, intervention, and approved recovery completed successfully through the `tsx` runner.

## Explicitly unverified gate

Physical-device acceptance is not claimed. A real Android or iPhone, Bluetooth headset, LiveKit credentials, Egress storage, and current Chrome monitor session are still required to prove pairing, foreground camera/audio publishing, desktop subscription, and canonical media persistence.

Directly launching compiled API output is also deferred until package bundling resolves workspace `.js` import paths; the supported local runner is `pnpm --filter ./apps/api exec tsx src/server.ts`.
