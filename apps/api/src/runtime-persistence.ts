import { createPool, withTenantContext } from '@vision-codef/database';
import type { TenantContext, EventEnvelope } from '@vision-codef/contracts';
import type { CaptureSession, DeploymentRun, DevelopmentStore, MediaAsset, Workflow } from './store.js';

type RuntimeEntity = {
  companyId: string;
  id: string;
  entityType: 'workflow' | 'capture' | 'media_asset' | 'deployment' | 'event';
  payload: Workflow | CaptureSession | MediaAsset | DeploymentRun | EventEnvelope;
};

export type RuntimePersistence = {
  load(store: DevelopmentStore): Promise<void>;
  save(store: DevelopmentStore): Promise<void>;
  close(): Promise<void>;
};

function configuredTenants(env: NodeJS.ProcessEnv = process.env): TenantContext[] {
  return (env.VISION_CODEF_ALLOWED_MEMBERS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [companyId, memberId] = entry.split('/');
      return companyId && memberId ? { companyId, memberId } : undefined;
    })
    .filter((value): value is TenantContext => Boolean(value));
}

function entitiesFor(store: DevelopmentStore, tenant: TenantContext): RuntimeEntity[] {
  const entities: RuntimeEntity[] = [];
  for (const workflow of store.workflows.values()) if (workflow.companyId === tenant.companyId) entities.push({ companyId: tenant.companyId, id: workflow.id, entityType: 'workflow', payload: workflow });
  for (const capture of store.captures.values()) if (capture.companyId === tenant.companyId) entities.push({ companyId: tenant.companyId, id: capture.id, entityType: 'capture', payload: capture });
  for (const asset of store.mediaAssets.values()) if (asset.companyId === tenant.companyId) entities.push({ companyId: tenant.companyId, id: asset.id, entityType: 'media_asset', payload: asset });
  for (const deployment of store.deployments.values()) if (deployment.companyId === tenant.companyId) entities.push({ companyId: tenant.companyId, id: deployment.id, entityType: 'deployment', payload: deployment });
  for (const event of store.events) if (event.companyId === tenant.companyId) entities.push({ companyId: tenant.companyId, id: event.eventId, entityType: 'event', payload: event });
  return entities;
}

function restore(store: DevelopmentStore, entityType: RuntimeEntity['entityType'], payload: RuntimeEntity['payload']): void {
  if (entityType === 'workflow') store.workflows.set((payload as Workflow).id, payload as Workflow);
  else if (entityType === 'capture') store.captures.set((payload as CaptureSession).id, payload as CaptureSession);
  else if (entityType === 'media_asset') store.mediaAssets.set((payload as MediaAsset).id, payload as MediaAsset);
  else if (entityType === 'deployment') store.deployments.set((payload as DeploymentRun).id, payload as DeploymentRun);
  else store.events.push(payload as EventEnvelope);
}

export function createPostgresRuntimePersistence(env: NodeJS.ProcessEnv = process.env): RuntimePersistence {
  const tenants = configuredTenants(env);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL runtime persistence.');
  if (tenants.length === 0) throw new Error('VISION_CODEF_ALLOWED_MEMBERS is required for PostgreSQL runtime persistence.');
  const pool = createPool(env.DATABASE_URL);
  return {
    async load(store) {
      for (const tenant of tenants) {
        await withTenantContext(pool, tenant, async (db) => {
          const result = await db.query<{ entity_type: RuntimeEntity['entityType']; payload: RuntimeEntity['payload'] }>(
            'SELECT entity_type, payload FROM api_runtime_state ORDER BY updated_at ASC, entity_id ASC',
          );
          for (const row of result.rows) restore(store, row.entity_type, row.payload);
        });
      }
    },
    async save(store) {
      for (const tenant of tenants) {
        const entities = entitiesFor(store, tenant);
        await withTenantContext(pool, tenant, async (db) => {
          for (const entity of entities) {
            await db.query(
              `INSERT INTO api_runtime_state (company_id, entity_type, entity_id, payload, updated_at)
               VALUES ($1, $2, $3, $4::jsonb, now())
               ON CONFLICT (company_id, entity_type, entity_id)
               DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
              [entity.companyId, entity.entityType, entity.id, JSON.stringify(entity.payload)],
            );
          }
        });
      }
    },
    async close() { await pool.end(); },
  };
}

export function createConfiguredRuntimePersistence(env: NodeJS.ProcessEnv = process.env): RuntimePersistence | undefined {
  if ((env.VISION_CODEF_PERSISTENCE ?? 'memory') !== 'postgres') return undefined;
  return createPostgresRuntimePersistence(env);
}
