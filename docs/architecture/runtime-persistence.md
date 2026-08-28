# API runtime persistence

The API demonstrator keeps its domain-shaped state in `DevelopmentStore` so the
vertical slice remains easy to run locally. When `VISION_CODEF_PERSISTENCE=postgres`
is set, the same store hydrates from and flushes to PostgreSQL `api_runtime_state`
using a transaction-local `TenantContext`. The table is protected by forced RLS;
deployment state, capture state, media references, workflows, and audit events are
all company-prefixed and persisted.

Before starting the API in PostgreSQL mode, run:

```sh
pnpm --filter @vision-codef/database db:migrate
pnpm --filter @vision-codef/database db:seed
```

Production startup fails unless PostgreSQL mode is enabled. Development can use
the in-memory fallback only for local demonstrator work. The API allow-list is an
identity-gateway boundary (`VISION_CODEF_ALLOWED_MEMBERS`); it is not a substitute
for a production OIDC/JWT verifier. A production deployment must populate that
boundary from the verified authenticated principal.
