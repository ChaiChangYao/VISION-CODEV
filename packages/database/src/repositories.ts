import type { TenantDatabase } from './types.js';
import type { CaptureSessionRecord, MediaAssetRecord, WorkflowRecord } from './types.js';
import { generateUuidV7 } from './ids.js';

export class WorkflowRepository {
  public constructor(private readonly db: TenantDatabase) {}

  public async create(input: { name: string; family: WorkflowRecord['family']; id?: string }): Promise<WorkflowRecord> {
    const result = await this.db.query<WorkflowRecord>(
      `INSERT INTO workflows (id, company_id, created_by_member_id, name, family)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.id ?? generateUuidV7(), this.db.tenant.companyId, this.db.tenant.memberId, input.name, input.family],
    );
    return result.rows[0]!;
  }

  public async list(): Promise<WorkflowRecord[]> {
    const result = await this.db.query<WorkflowRecord>('SELECT * FROM workflows WHERE company_id = $1 ORDER BY updated_at DESC, id DESC', [this.db.tenant.companyId]);
    return result.rows;
  }

  public async get(id: string): Promise<WorkflowRecord | undefined> {
    const result = await this.db.query<WorkflowRecord>('SELECT * FROM workflows WHERE company_id = $1 AND id = $2', [this.db.tenant.companyId, id]);
    return result.rows[0];
  }
}

export class CaptureRepository {
  public constructor(private readonly db: TenantDatabase) {}

  public async create(workflowId: string, input: { livekitRoom?: string; id?: string } = {}): Promise<CaptureSessionRecord> {
    const result = await this.db.query<CaptureSessionRecord>(
      `INSERT INTO capture_sessions (id, company_id, workflow_id, livekit_room)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.id ?? generateUuidV7(), this.db.tenant.companyId, workflowId, input.livekitRoom ?? null],
    );
    return result.rows[0]!;
  }

  public async get(id: string): Promise<CaptureSessionRecord | undefined> {
    const result = await this.db.query<CaptureSessionRecord>('SELECT * FROM capture_sessions WHERE company_id = $1 AND id = $2', [this.db.tenant.companyId, id]);
    return result.rows[0];
  }

  public async addMediaAsset(sessionId: string, input: { objectKey: string; state?: MediaAssetRecord['state']; id?: string }): Promise<MediaAssetRecord> {
    const result = await this.db.query<MediaAssetRecord>(
      `INSERT INTO media_assets (id, company_id, capture_session_id, object_key, state)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.id ?? generateUuidV7(), this.db.tenant.companyId, sessionId, input.objectKey, input.state ?? 'pending'],
    );
    return result.rows[0]!;
  }
}
