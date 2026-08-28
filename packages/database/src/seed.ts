import { createHash } from 'node:crypto';
import { createPool, withTenantContext } from './client.js';
import { migrate } from './migrate.js';

export const DEMO_IDS = {
  company: '00000000-0000-7000-8000-000000000001',
  member: '00000000-0000-4000-8000-000000000002',
  workflow: '00000000-0000-4000-8000-000000000003',
  capture: '00000000-0000-4000-8000-000000000004',
  graph: '00000000-0000-4000-8000-000000000005',
};

export async function seedDemo(connectionString?: string): Promise<void> {
  await migrate(connectionString);
  const pool = createPool(connectionString);
  try {
    await pool.query("SELECT set_config('app.company_id', $1, false)", [DEMO_IDS.company]);
    await pool.query(
      `INSERT INTO companies (id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
      [DEMO_IDS.company, 'Vision Codef Demo', 'vision-codef-demo'],
    );
    await pool.query(
      `INSERT INTO members (id, company_id, email, display_name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`,
      [DEMO_IDS.member, DEMO_IDS.company, 'demo@vision-codef.local', 'Demo Technician'],
    );
    await withTenantContext(
      pool,
      { companyId: DEMO_IDS.company, memberId: DEMO_IDS.member },
      async (db) => {
        const content = {
          states: [{ id: 'ready', label: 'Ready' }],
          steps: [
            {
              id: 'fold-1',
              title: 'Make the first fold',
              instruction: 'Fold the paper corner to the center crease.',
            },
          ],
        };
        await db.query(
          `INSERT INTO workflows (id, company_id, created_by_member_id, name, family)
         VALUES ($1, $2, $3, $4, 'golden_run') ON CONFLICT (id) DO NOTHING`,
          [DEMO_IDS.workflow, DEMO_IDS.company, DEMO_IDS.member, 'Paper Crane Golden Run'],
        );
        await db.query(
          `INSERT INTO capture_sessions (id, company_id, workflow_id, state, livekit_room)
         VALUES ($1, $2, $3, 'completed', $4) ON CONFLICT (id) DO NOTHING`,
          [
            DEMO_IDS.capture,
            DEMO_IDS.company,
            DEMO_IDS.workflow,
            `company-${DEMO_IDS.company}-golden-run`,
          ],
        );
        await db.query(
          `INSERT INTO procedure_graphs (id, company_id, workflow_id, version, content, content_hash, published_at)
         VALUES ($1, $2, $3, 1, $4, $5, now()) ON CONFLICT (id) DO NOTHING`,
          [
            DEMO_IDS.graph,
            DEMO_IDS.company,
            DEMO_IDS.workflow,
            content,
            createHash('sha256').update(JSON.stringify(content)).digest('hex'),
          ],
        );
      },
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts'))
  seedDemo().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
