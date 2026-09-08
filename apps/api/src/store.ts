import type { CaptureState, EventEnvelope, MediaAssetState, MediaObjectReference, ProcessingMetadata, ProcedureAnnotation, ProcedureGraph, WorkflowFamily, WorkflowReferencePack } from '@vision-codef/contracts';
import type { RuntimePersistence } from './runtime-persistence.js';
import type { DeviationState, VoiceState } from '@vision-codef/workflow-engine';

export type Workflow = {
  id: string; companyId: string; title: string; family: Exclude<WorkflowFamily, 'ambiguous'>; objective: string;
  status: 'Draft' | 'Capturing' | 'Processing' | 'Needs Review' | 'Approved' | 'Published' | 'Withdrawn' | 'Processing Failed';
  createdAt: string; updatedAt: string; graph?: ProcedureGraph;
};
export type CaptureSession = { id: string; workflowId: string; companyId: string; state: CaptureState; source?: 'phone' | 'import'; pairingCode?: string; pairingExpiresAt?: string; pairedDeviceId?: string; pairedAt?: string; startedAt?: string; endedAt?: string; durationMs?: number; mediaAssetId?: string; egressId?: string; processingWorkflowId?: string; processingRunId?: string; processingSubmittedAt?: string; processingAttemptCount?: number; processingStatus?: 'submitted' | 'blocked' | 'failed' | 'completed'; processingBlockReason?: string; processingStage?: string; processingProgress?: number; processingMessage?: string; processingHeartbeatAt?: string; processingMetadata?: ProcessingMetadata; processingArtifacts?: { finalized: MediaObjectReference; transcript: MediaObjectReference; observations: MediaObjectReference; procedureDraft: MediaObjectReference } };
export type MediaAsset = { id: string; companyId: string; captureSessionId: string; state: MediaAssetState; objectKey: string; egressId?: string; storageKind?: 'canonical_egress' | 'local_import'; originalFilename?: string; contentType?: string; sizeBytes?: number; sha256?: string; localPath?: string };
export type DeploymentRun = { id: string; workflowId: string; companyId: string; status: 'ready' | 'active' | 'paused' | 'completed' | 'failed'; currentStep: number; deviations: Array<{ id: string; state: 'candidate' | 'confirmed' | 'recovering' | 'resolved' | 'overridden' | 'unresolved'; severity: string }>; paperState?: DeviationState; intervention?: Record<string, unknown>; voiceState?: VoiceState };
export class DevelopmentStore {
  readonly workflows = new Map<string, Workflow>();
  readonly captures = new Map<string, CaptureSession>();
  readonly mediaAssets = new Map<string, MediaAsset>();
  readonly deployments = new Map<string, DeploymentRun>();
  readonly annotations = new Map<string, ProcedureAnnotation>();
  readonly referencePacks = new Map<string, WorkflowReferencePack>();
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

