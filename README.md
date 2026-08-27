# Vision Codef

Vision Codef captures an expert's physical procedure as a reviewable Golden Run and guides another person through the approved procedure live while detecting recoverable deviations.

## Current build focus

The first integration milestone is the physical-device Golden Run loop:

`create → pair phone → capture → monitor → process → approve → deploy → detect → recover`

Secondary CCTV, ONVIF, Camera Automation, billing depth, exports, and analytics remain gated until this loop is proven.

## Repository layout

- `apps/web` — desktop and responsive web application
- `apps/mobile` — native React Native application managed with Expo prebuild
- `apps/api` — TypeScript API and realtime orchestration
- `apps/worker` — durable background jobs and Temporal workers
- `services/` — Python ML and document services
- `packages/contracts` — versioned shared contracts
- `packages/database` — schema, migrations, repositories, and seeds
- `packages/workflow-engine` — procedure and camera-rule execution
- `packages/ui` — shared design system
- `infra/` — local and deployment infrastructure
- `docs/` — ADRs, architecture, operations, and build journal

## Development

Copy `.env.example` to `.env`, start local dependencies with `pnpm infra:up` once the foundation phase lands, then use `pnpm dev`.

All tenant data is company-scoped. The demonstrator is not a certified safety system and must not be used as a substitute for approved safety procedures or trained personnel.

