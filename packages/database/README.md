# `@vision-codef/database`

The database package owns the tenant-enforced PostgreSQL schema, migrations, repositories, and deterministic demo seed.

## Local usage

From the repository root:

```sh
pnpm --filter @vision-codef/database db:migrate
pnpm --filter @vision-codef/database db:seed
```

Every repository is constructed with a `TenantDatabase` created by `withTenantContext`. The helper sets transaction-local `app.company_id` and `app.member_id`; PostgreSQL RLS then enforces the same company boundary independently of repository predicates.

The mobile Egress object is canonical. Recovery assets should use `derived_from_asset_id` and preserve the original asset.
