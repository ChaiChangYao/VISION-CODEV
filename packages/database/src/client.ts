import { Pool, type PoolClient } from 'pg';
import { TenantContextSchema, type TenantContext } from '@vision-codef/contracts';
import type { TenantDatabase } from './types.js';

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) throw new Error('DATABASE_URL is required to create a database pool');
  return new Pool({ connectionString, max: 10, application_name: 'vision-codef' });
}

class TenantTransaction implements TenantDatabase {
  public constructor(
    public readonly tenant: TenantContext,
    private readonly client: PoolClient,
  ) {}

  public async query<T extends object = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: T[] }> {
    return this.client.query<T>(text, values as unknown[]);
  }
}

export async function withTenantContext<T>(
  pool: Pool,
  rawTenant: TenantContext,
  fn: (db: TenantDatabase) => Promise<T>,
): Promise<T> {
  const tenant = TenantContextSchema.parse(rawTenant);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.company_id', $1, true), set_config('app.member_id', $2, true)",
      [tenant.companyId, tenant.memberId],
    );
    const membership = await client.query(
      'SELECT 1 FROM members WHERE company_id =  AND id =  LIMIT 1',
      [tenant.companyId, tenant.memberId],
    );
    if (membership.rows.length === 0) throw new Error('Tenant member is not a member of the requested company.');
    const result = await fn(new TenantTransaction(tenant, client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
