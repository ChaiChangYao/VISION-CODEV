import type { TenantContext } from '@vision-codef/contracts';

export type { TenantContext };

export interface TenantDatabase {
  readonly tenant: TenantContext;
  query<T extends object = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface WorkflowRecord {
  id: string;
  company_id: string;
  created_by_member_id: string;
  name: string;
  family: 'golden_run' | 'camera_automation' | 'ambiguous';
  status: 'draft' | 'training' | 'processing' | 'approved' | 'deployed' | 'archived';
  created_at: Date;
  updated_at: Date;
}

export interface CaptureSessionRecord {
  id: string;
  company_id: string;
  workflow_id: string;
  state:
    | 'draft'
    | 'preparing'
    | 'active'
    | 'paused'
    | 'finalizing'
    | 'processing'
    | 'completed'
    | 'failed';
  livekit_room: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
}

export interface MediaAssetRecord {
  id: string;
  company_id: string;
  capture_session_id: string;
  state:
    | 'pending'
    | 'uploading'
    | 'available'
    | 'recovery_required'
    | 'reconciled'
    | 'failed'
    | 'deleted';
  object_key: string;
  content_sha256: string | null;
  derived_from_asset_id: string | null;
  duration_ms: string | null;
  created_at: Date;
}
