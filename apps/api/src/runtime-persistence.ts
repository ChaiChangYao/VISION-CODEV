import { createPool, withTenantContext } from '@vision-codef/database';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { TenantContext, EventEnvelope, ProcedureAnnotation, WorkflowReferencePack } from '@vision-codef/contracts';
import type { CaptureSession, DeploymentRun, DevelopmentStore, MediaAsset, Workflow } from './store.js';

type RuntimeEntity = {
  companyId: string;
  id: string;
  entityType: 'workflow' | 'capture' | 'media_asset' | 'deployment' | 'annotation' | 'reference_pack' | 'event';
  payload: Workflow | CaptureSession | MediaAsset | DeploymentRun | ProcedureAnnotation | WorkflowReferencePack | EventEnvelope;
};

export type RuntimePersistence = {
  load(store: DevelopmentStore): Promise<void>;
  save(store: DevelopmentStore): Promise<void>;
  close(): Promise<void>;
};

type FileSnapshot = {
  version: 1;
  workflows: Workflow[];
  captures: CaptureSession[];
  mediaAssets: MediaAsset[];
  deployments: DeploymentRun[];
  annotations: ProcedureAnnotation[];
  referencePacks: WorkflowReferencePack[];
  events: EventEnvelope[];
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
  for (const annotation of store.annotations.values()) if (annotation.companyId === tenant.companyId) entities.push({ companyId: tenant.companyId, id: annotation.id, entityType: 'annotation', payload: annotation });
  for (const pack of store.referencePacks.values()) if (pack.companyId === tenant.companyId) entities.push({ companyId: tenant.companyId, id: pack.id, entityType: 'reference_pack', payload: pack });
  for (const event of store.events) if (event.companyId === tenant.companyId) entities.push({ companyId: tenant.companyId, id: event.eventId, entityType: 'event', payload: event });
  return entities;
}

function restore(store: DevelopmentStore, entityType: RuntimeEntity['entityType'], payload: RuntimeEntity['payload']): void {
  if (entityType === 'workflow') store.workflows.set((payload as Workflow).id, payload as Workflow);
  else if (entityType === 'capture') store.captures.set((payload as CaptureSession).id, payload as CaptureSession);
  else if (entityType === 'media_asset') store.mediaAssets.set((payload as MediaAsset).id, payload as MediaAsset);
  else if (entityType === 'deployment') store.deployments.set((payload as DeploymentRun).id, payload as DeploymentRun);
  else if (entityType === 'annotation') store.annotations.set((payload as ProcedureAnnotation).id, payload as ProcedureAnnotation);
  else if (entityType === 'reference_pack') store.referencePacks.set((payload as WorkflowReferencePack).id, payload as WorkflowReferencePack);
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

export function createFileRuntimePersistence(env: NodeJS.ProcessEnv = process.env): RuntimePersistence {
  const path = resolve(env.VISION_CODEF_RUNTIME_STATE_PATH?.trim() || resolve(process.cwd(), '.vision-codef', 'runtime-state.json'));
  let pendingWrite = Promise.resolve();
  return {
    async load(store) {
      let snapshot: FileSnapshot;
      try { snapshot = JSON.parse(await readFile(path, 'utf8')) as FileSnapshot; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
      for (const value of snapshot.workflows ?? []) store.workflows.set(value.id, value);
      for (const value of snapshot.captures ?? []) store.captures.set(value.id, value);
      for (const value of snapshot.mediaAssets ?? []) store.mediaAssets.set(value.id, value);
      for (const value of snapshot.deployments ?? []) store.deployments.set(value.id, value);
      for (const value of snapshot.annotations ?? []) store.annotations.set(value.id, value);
      for (const value of snapshot.referencePacks ?? []) store.referencePacks.set(value.id, value);
      store.events.push(...(snapshot.events ?? []));
    },
    async save(store) {
      const snapshot: FileSnapshot = { version: 1, workflows: [...store.workflows.values()], captures: [...store.captures.values()], mediaAssets: [...store.mediaAssets.values()], deployments: [...store.deployments.values()], annotations: [...store.annotations.values()], referencePacks: [...store.referencePacks.values()], events: store.events };
      pendingWrite = pendingWrite.then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const temporaryPath = `${path}.tmp`;
        await writeFile(temporaryPath, JSON.stringify(snapshot), 'utf8');
        await rename(temporaryPath, path);
      });
      await pendingWrite;
    },
    async close() { await pendingWrite; },
  };
}

export function createConfiguredRuntimePersistence(env: NodeJS.ProcessEnv = process.env): RuntimePersistence | undefined {
  const mode = env.VISION_CODEF_PERSISTENCE ?? (env.NODE_ENV === 'production' ? 'memory' : 'file');
  if (mode === 'postgres') return createPostgresRuntimePersistence(env);
  if (mode === 'file') return createFileRuntimePersistence(env);
  return undefined;
}
