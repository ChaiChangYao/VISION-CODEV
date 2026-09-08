import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { createPool, withTenantContext } from './client.js';
import { generateUuidV7 } from './ids.js';
import { migrate } from './migrate.js';
import { WorkflowRepository } from './repositories.js';

const migrationPath = fileURLToPath(new URL('../migrations/001_foundation.sql', import.meta.url));

const tenantA = {
  companyId: '018f2d7e-4e8a-7b1a-8c42-3c8b9c5d2001',
  memberId: '018f2d7e-4e8a-7b1a-8c42-3c8b9c5d2002',
};
const tenantB = {
  companyId: '018f2d7e-4e8a-7b1a-8c42-3c8b9c5d2003',
  memberId: '018f2d7e-4e8a-7b1a-8c42-3c8b9c5d2004',
};

describe('tenant isolation migration contract', () => {
  it('forces RLS and installs a tenant policy on every tenant table', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('ALTER TABLE companies FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY tenant_isolation ON companies');
    expect(sql).toContain('ALTER TABLE %I FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY tenant_isolation ON %I');
    for (const table of [
      'members',
      'workflows',
      'capture_sessions',
      'media_assets',
      'observations',
      'procedure_graphs',
      'deployments',
      'audit_events',
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
  });

  it('checks membership with parameterized company and member IDs', async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const query = vi.fn(async (text: string, values?: readonly unknown[]) => {
      calls.push({ text, values });
      return text.startsWith('SELECT 1 FROM members') ? { rows: [{}] } : { rows: [] };
    });
    const pool = {
      connect: async () => ({ query, release: vi.fn() }),
    } as unknown as Pool;

    await withTenantContext(pool, tenantA, async (db) => db.query('SELECT 1'));

    const membershipCall = calls.find((call) => call.text.startsWith('SELECT 1 FROM members'));
    expect(membershipCall?.text).toContain('company_id = $1 AND id = $2');
    expect(membershipCall?.values).toEqual([tenantA.companyId, tenantA.memberId]);
  });
  it('uses tenant context in repository queries and never exposes an unscoped get-by-id API', async () => {
    const repositorySource = await readFile(
      fileURLToPath(new URL('./repositories.ts', import.meta.url)),
      'utf8',
    );
    expect(repositorySource).toContain('this.db.tenant.companyId');
    expect(repositorySource).not.toMatch(/findById\s*\(/);
  });
});

const liveIntegration = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!liveIntegration)('live PostgreSQL isolation', () => {
  let pool: Pool;
  let workflowId: string;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required for live isolation tests');
    await migrate(connectionString);
    pool = createPool(connectionString);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.company_id', $1, true)", [tenantA.companyId]);
      await client.query(
        `INSERT INTO companies (id, name, slug) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
        [tenantA.companyId, 'Isolation Test A', 'isolation-test-a'],
      );
      await client.query(
        `INSERT INTO members (id, company_id, email, display_name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`,
        [tenantA.memberId, tenantA.companyId, 'isolation-a@example.test', 'Isolation A'],
      );
      await client.query("SELECT set_config('app.company_id', $1, true)", [tenantB.companyId]);
      await client.query(
        `INSERT INTO companies (id, name, slug) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
        [tenantB.companyId, 'Isolation Test B', 'isolation-test-b'],
      );
      await client.query(
        `INSERT INTO members (id, company_id, email, display_name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`,
        [tenantB.memberId, tenantB.companyId, 'isolation-b@example.test', 'Isolation B'],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.company_id', $1, true)", [tenantA.companyId]);
      if (workflowId) await client.query('DELETE FROM workflows WHERE id = $1', [workflowId]);
      await client.query('DELETE FROM members WHERE id = $1', [tenantA.memberId]);
      await client.query('DELETE FROM companies WHERE id = $1', [tenantA.companyId]);
      await client.query("SELECT set_config('app.company_id', $1, true)", [tenantB.companyId]);
      await client.query('DELETE FROM members WHERE id = $1', [tenantB.memberId]);
      await client.query('DELETE FROM companies WHERE id = $1', [tenantB.companyId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('prevents cross-company reads while allowing each member to access its own data', async () => {
    workflowId = generateUuidV7();
    const ownWorkflow = await withTenantContext(pool, tenantA, (db) =>
      new WorkflowRepository(db).create({
        id: workflowId,
        name: 'Tenant A workflow',
        family: 'golden_run',
      }),
    );
    const result = await withTenantContext(pool, tenantB, async (db) => ({
      visibleOwn: await new WorkflowRepository(db).list(),
      hiddenOther: await new WorkflowRepository(db).get(ownWorkflow.id),
    }));

    expect(result.visibleOwn).toHaveLength(0);
    expect(result.hiddenOther).toBeUndefined();
  });
});
