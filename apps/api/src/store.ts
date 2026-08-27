import type { CaptureState, EventEnvelope, MediaAssetState, ProcedureGraph, WorkflowFamily } from '@vision-codef/contracts';

export type Workflow = {
  id: string; companyId: string; title: string; family: Exclude<WorkflowFamily, 'ambiguous'>; objective: string;
  status: 'Draft' | 'Capturing' | 'Processing' | 'Needs Review' | 'Approved' | 'Published' | 'Withdrawn' | 'Processing Failed';
  createdAt: string; updatedAt: string; graph?: ProcedureGraph;
};
export type CaptureSession = { id: string; workflowId: string; companyId: string; state: CaptureState; startedAt?: string; endedAt?: string; mediaAssetId?: string; egressId?: string };
export type MediaAsset = { id: string; companyId: string; captureSessionId: string; state: MediaAssetState; objectKey: string; egressId?: string };
export type DeploymentRun = { id: string; workflowId: string; companyId: string; status: 'ready' | 'active' | 'paused' | 'completed' | 'failed'; currentStep: number; deviations: Array<{ id: string; state: 'candidate' | 'confirmed' | 'recovering' | 'resolved' | 'overridden' | 'unresolved'; severity: string }> };
export class DevelopmentStore { readonly workflows = new Map<string, Workflow>(); readonly captures = new Map<string, CaptureSession>(); readonly mediaAssets = new Map<string, MediaAsset>(); readonly deployments = new Map<string, DeploymentRun>(); readonly events: EventEnvelope[] = []; }

