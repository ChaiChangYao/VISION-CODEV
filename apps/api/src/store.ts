import type { CaptureState, EventEnvelope, MediaAssetState, MediaObjectReference, ProcessingMetadata, ProcedureGraph, WorkflowFamily } from '@vision-codef/contracts';
import type { RuntimePersistence } from './runtime-persistence.js';

export type Workflow = {
  id: string; companyId: string; title: string; family: Exclude<WorkflowFamily, 'ambiguous'>; objective: string;
  status: 'Draft' | 'Capturing' | 'Processing' | 'Needs Review' | 'Approved' | 'Published' | 'Withdrawn' | 'Processing Failed';
  createdAt: string; updatedAt: string; graph?: ProcedureGraph;
};
export type CaptureSession = { id: string; workflowId: string; companyId: string; state: CaptureState; pairingCode: string; pairingExpiresAt: string; pairedDeviceId?: string; pairedAt?: string; startedAt?: string; endedAt?: string; mediaAssetId?: string; egressId?: string; processingWorkflowId?: string; processingRunId?: string; processingStatus?: 'submitted' | 'blocked' | 'failed' | 'completed'; processingBlockReason?: string; processingMetadata?: ProcessingMetadata; processingArtifacts?: { finalized: MediaObjectReference; transcript: MediaObjectReference; observations: MediaObjectReference; procedureDraft: MediaObjectReference } };
export type MediaAsset = { id: string; companyId: string; captureSessionId: string; state: MediaAssetState; objectKey: string; egressId?: string };
export type DeploymentRun = { id: string; workflowId: string; companyId: string; status: 'ready' | 'active' | 'paused' | 'completed' | 'failed'; currentStep: number; deviations: Array<{ id: string; state: 'candidate' | 'confirmed' | 'recovering' | 'resolved' | 'overridden' | 'unresolved'; severity: string }> };
export class DevelopmentStore {
  readonly workflows = new Map<string, Workflow>();
  readonly captures = new Map<string, CaptureSession>();
  readonly mediaAssets = new Map<string, MediaAsset>();
  readonly deployments = new Map<string, DeploymentRun>();
  readonly events: EventEnvelope[] = [];
  readonly ready: Promise<void>;

  public constructor(private readonly persistence?: RuntimePersistence) {
    this.ready = persistence?.load(this) ?? Promise.resolve();
  }

  public async flush(): Promise<void> {
    await this.ready;
    await this.persistence?.save(this);
  }

  public async close(): Promise<void> {
    await this.persistence?.close();
  }
}

