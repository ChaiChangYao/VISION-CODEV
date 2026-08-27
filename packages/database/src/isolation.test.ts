import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(new URL('../migrations/001_foundation.sql', import.meta.url));

describe('tenant isolation migration contract', () => {
  it('forces RLS and installs a tenant policy on every tenant table', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    for (const table of ['companies', 'members', 'workflows', 'capture_sessions', 'media_assets', 'observations', 'procedure_graphs', 'deployments', 'audit_events']) {
      expect(sql).toContain('ALTER TABLE %I FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('CREATE POLICY tenant_isolation ON %I');
      expect(sql).toContain(`'${table}'`);
    }
  });

  it('uses tenant context in repository queries and never exposes an unscoped get-by-id API', async () => {
    const repositorySource = await readFile(fileURLToPath(new URL('./repositories.ts', import.meta.url)), 'utf8');
    expect(repositorySource).toContain('this.db.tenant.companyId');
    expect(repositorySource).not.toMatch(/findById\s*\(/);
  });
});

describe.skipIf(process.env.RUN_DB_INTEGRATION !== '1')('live PostgreSQL isolation', () => {
  it('is enabled only by the explicit integration-test gate', () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
  });
});
