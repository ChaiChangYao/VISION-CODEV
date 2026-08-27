# Repository ownership and integration rules

The coordinator owns the integration branch, root configuration, phase commits, ADRs, build journals, and cross-package fixes.

| Workstream | Primary paths |
| --- | --- |
| Foundation | `packages/contracts`, `packages/database`, `packages/config`, `packages/observability`, `infra`, foundation docs |
| Web | `apps/web`, `packages/ui` |
| Procedure intelligence | `packages/workflow-engine`, `services/procedure-intelligence`, replay fixtures |
| Capture | `apps/mobile`, LiveKit capture integration, capture fixtures |

Each agent works in a dedicated branch/worktree and must report changed files, tests, and unresolved contract questions. Shared contract changes require coordinator review.

