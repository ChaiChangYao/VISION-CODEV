import type {
  CaptureState,
  MediaAssetState,
  ProcedureGraph,
  ProcedureStep,
  TenantContext,
  WorkflowFamily,
  WorkflowIntent,
} from '@vision-codef/contracts';

export type ApiFetcher = typeof fetch;

export type ApiClientConfig = {
  baseUrl?: string;
  tenant?: TenantContext;
  token?: string;
  fetcher?: ApiFetcher;
};

export type ApiErrorCode =
  | 'API_UNCONFIGURED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_TENANT'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'MEDIA_UNAVAILABLE'
  | 'PROCESSING_FAILED'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly traceId?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { status?: number; traceId?: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = options?.status;
    this.traceId = options?.traceId;
    this.details = options?.details;
  }
}

export type WorkflowSummary = {
  id: string;
  title: string;
  description: string;
  family: WorkflowFamily;
  status: string;
  stage: 'train' | 'processing' | 'approve' | 'deploy';
  createdAt: string;
  updatedAt: string;
};

export type CaptureSessionView = {
  id: string;
  workflowId: string;
  state: CaptureState;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'degraded';
  roomName?: string;
  pairingCode?: string;
  pairingUrl?: string;
  durationMs?: number;
  mediaAsset?: { id: string; state: MediaAssetState; objectKey?: string };
};

export type LiveKitMonitor = {
  sessionId: string;
  roomName: string;
  serverUrl: string;
  viewerToken: string;
  status: 'waiting' | 'connected' | 'degraded' | 'disconnected';
  previewUrl?: string;
  audioConnected: boolean;
  videoConnected: boolean;
};

export type ProcessingStatus = {
  sessionId: string;
  status: 'queued' | 'transcribing' | 'extracting' | 'inducing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  graphId?: string;
};

export type DeploymentView = {
  id: string;
  workflowId: string;
  status: 'ready' | 'starting' | 'monitoring' | 'intervention_required' | 'recovering' | 'completed' | 'failed';
  currentStep: number;
  totalSteps: number;
  currentInstruction?: string;
  intervention?: {
    title: string;
    detail: string;
    recoveryStepId: string;
    confidence: number;
    persistenceMs: number;
  };
  why?: { text: string; evidenceIds: string[]; procedureVersion: number };
};

export type PaperCraneObservation = {
  timestampMs: number;
  corners: Array<{ x: number; y: number }>;
  foldState: 'flat' | 'diagonal-left' | 'diagonal-right' | 'triangle' | 'completed' | 'unknown';
  visibilityScore: number;
  alignmentScore: number;
  handOccluded: boolean;
};
export type WorkflowApi = {
  routeIntent(brief: string): Promise<WorkflowIntent>;
  createWorkflow(input: { brief: string; family: 'golden_run' }): Promise<WorkflowSummary>;
  getWorkflow(workflowId: string): Promise<WorkflowSummary>;
  listWorkflows(): Promise<WorkflowSummary[]>;
  createCaptureSession(workflowId: string): Promise<CaptureSessionView>;
  getCaptureSession(sessionId: string): Promise<CaptureSessionView>;
  startCapture(sessionId: string): Promise<CaptureSessionView>;
  stopCapture(sessionId: string): Promise<CaptureSessionView>;
  getMonitor(sessionId: string): Promise<LiveKitMonitor>;
  getProcessing(sessionId: string): Promise<ProcessingStatus>;
  getProcedureGraph(workflowId: string): Promise<ProcedureGraph>;
  updateProcedureGraph(workflowId: string, graph: ProcedureGraph): Promise<ProcedureGraph>;
  publishProcedure(workflowId: string, input: { graph: ProcedureGraph; reviewerNote?: string }): Promise<ProcedureGraph>;
  startDeployment(workflowId: string): Promise<DeploymentView>;
  getDeployment(deploymentId: string): Promise<DeploymentView>;
  requestRecovery(deploymentId: string, recoveryStepId: string): Promise<DeploymentView>;
  observeDeployment(deploymentId: string, observation: PaperCraneObservation): Promise<DeploymentView & { decision: string; decisionReason: string }>;
};

type ApiEnvelope<T> = { data: T; traceId: string; schemaVersion: string };

const defaultBaseUrl = () => process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? '';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeWorkflow(value: unknown): WorkflowSummary {
  const input = asRecord(value);
  return {
    id: String(input.id ?? ''),
    title: String(input.title ?? input.name ?? 'Golden Run workflow'),
    description: String(input.description ?? input.brief ?? ''),
    family: (input.family === 'camera_automation' ? 'camera_automation' : 'golden_run') as WorkflowFamily,
    status: String(input.status ?? 'draft'),
    stage: (input.stage ?? 'train') as WorkflowSummary['stage'],
    createdAt: String(input.createdAt ?? input.created_at ?? ''),
    updatedAt: String(input.updatedAt ?? input.updated_at ?? ''),
  };
}

function normalizeCapture(value: unknown): CaptureSessionView {
  const input = asRecord(value);
  const media = asRecord(input.mediaAsset ?? input.media_asset);
  return {
    id: String(input.id ?? ''),
    workflowId: String(input.workflowId ?? input.workflow_id ?? ''),
    state: (input.state ?? 'draft') as CaptureState,
    connectionStatus: (input.connectionStatus ?? input.connection_status ?? 'disconnected') as CaptureSessionView['connectionStatus'],
    roomName: input.roomName ? String(input.roomName) : undefined,
    pairingCode: input.pairingCode ? String(input.pairingCode) : undefined,
    pairingUrl: input.pairingUrl ? String(input.pairingUrl) : undefined,
    durationMs: typeof input.durationMs === 'number' ? input.durationMs : undefined,
    mediaAsset: media.id
      ? { id: String(media.id), state: (media.state ?? 'pending') as MediaAssetState, objectKey: media.objectKey ? String(media.objectKey) : undefined }
      : undefined,
  };
}

function normalizeProcessing(value: unknown): ProcessingStatus {
  const input = asRecord(value);
  return {
    sessionId: String(input.sessionId ?? input.session_id ?? ''),
    status: (input.status ?? 'queued') as ProcessingStatus['status'],
    progress: Math.max(0, Math.min(100, Number(input.progress ?? 0))),
    message: input.message ? String(input.message) : undefined,
    graphId: input.graphId ? String(input.graphId) : undefined,
  };
}

function normalizeMonitor(value: unknown): LiveKitMonitor {
  const input = asRecord(value);
  return {
    sessionId: String(input.sessionId ?? input.session_id ?? ''),
    roomName: String(input.roomName ?? input.room_name ?? ''),
    serverUrl: String(input.serverUrl ?? input.server_url ?? ''),
    viewerToken: String(input.viewerToken ?? input.viewer_token ?? ''),
    status: (input.status ?? 'waiting') as LiveKitMonitor['status'],
    previewUrl: input.previewUrl ? String(input.previewUrl) : undefined,
    audioConnected: Boolean(input.audioConnected ?? input.audio_connected),
    videoConnected: Boolean(input.videoConnected ?? input.video_connected),
  };
}

function normalizeDeployment(value: unknown): DeploymentView {
  const input = asRecord(value);
  const intervention = asRecord(input.intervention);
  const why = asRecord(input.why);
  return {
    id: String(input.id ?? ''),
    workflowId: String(input.workflowId ?? input.workflow_id ?? ''),
    status: (input.status ?? 'ready') as DeploymentView['status'],
    currentStep: Number(input.currentStep ?? input.current_step ?? 0),
    totalSteps: Number(input.totalSteps ?? input.total_steps ?? 0),
    currentInstruction: input.currentInstruction ? String(input.currentInstruction) : undefined,
    intervention: intervention.title
      ? {
          title: String(intervention.title),
          detail: String(intervention.detail ?? ''),
          recoveryStepId: String(intervention.recoveryStepId ?? intervention.recovery_step_id ?? ''),
          confidence: Number(intervention.confidence ?? 0),
          persistenceMs: Number(intervention.persistenceMs ?? intervention.persistence_ms ?? 0),
        }
      : undefined,
    why: why.text
      ? {
          text: String(why.text),
          evidenceIds: Array.isArray(why.evidenceIds) ? why.evidenceIds.map(String) : [],
          procedureVersion: Number(why.procedureVersion ?? 0),
        }
      : undefined,
  };
}

export function createApiClient(config: ApiClientConfig = {}): WorkflowApi {
  const baseUrl = (config.baseUrl ?? defaultBaseUrl()).replace(/\/$/, '');
  const fetcher = config.fetcher ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!baseUrl) {
      throw new ApiClientError(
        'API_UNCONFIGURED',
        'The Vision Codef API is not configured. Set NEXT_PUBLIC_API_BASE_URL to connect this workspace.',
      );
    }

    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body) headers.set('content-type', 'application/json');
    if (config.tenant?.companyId) headers.set('x-company-id', config.tenant.companyId);
    if (config.tenant?.memberId) headers.set('x-member-id', config.tenant.memberId);
    if (config.token) headers.set('authorization', `Bearer ${config.token}`);

    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, { ...init, headers });
    } catch (error) {
      throw new ApiClientError('NETWORK_ERROR', error instanceof Error ? error.message : 'The API could not be reached.');
    }

    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }
    const record = asRecord(body);
    const traceId = typeof record.traceId === 'string' ? record.traceId : undefined;
    if (!response.ok) {
      const error = asRecord(record.error ?? body);
      throw new ApiClientError(
        (error.code ?? 'INTERNAL_ERROR') as ApiErrorCode,
        String(error.message ?? `API request failed with status ${response.status}.`),
        { status: response.status, traceId, details: asRecord(error.details) },
      );
    }
    if (!('data' in record)) {
      throw new ApiClientError('INTERNAL_ERROR', 'The API returned an invalid contract envelope.', { status: response.status, traceId });
    }
    return (record as ApiEnvelope<T>).data;
  }

  return {
    async routeIntent(brief) {
      return request<WorkflowIntent>('/v1/workflows/intent', { method: 'POST', body: JSON.stringify({ brief }) });
    },
    async createWorkflow(input) {
      return normalizeWorkflow(await request('/v1/workflows', { method: 'POST', body: JSON.stringify(input) }));
    },
    async getWorkflow(workflowId) {
      return normalizeWorkflow(await request(`/v1/workflows/${workflowId}`));
    },
    async listWorkflows() {
      const result = await request<unknown>('/v1/workflows');
      const values = Array.isArray(result) ? result : asRecord(result).items;
      return Array.isArray(values) ? values.map(normalizeWorkflow) : [];
    },
    async createCaptureSession(workflowId) {
      return normalizeCapture(await request(`/v1/workflows/${workflowId}/capture-sessions`, { method: 'POST' }));
    },
    async getCaptureSession(sessionId) {
      return normalizeCapture(await request(`/v1/capture-sessions/${sessionId}`));
    },
    async startCapture(sessionId) {
      return normalizeCapture(await request(`/v1/capture-sessions/${sessionId}/start`, { method: 'POST' }));
    },
    async stopCapture(sessionId) {
      return normalizeCapture(await request(`/v1/capture-sessions/${sessionId}/stop`, { method: 'POST' }));
    },
    async getMonitor(sessionId) {
      return normalizeMonitor(await request(`/v1/capture-sessions/${sessionId}/monitor`));
    },
    async getProcessing(sessionId) {
      return normalizeProcessing(await request(`/v1/capture-sessions/${sessionId}/processing`));
    },
    async getProcedureGraph(workflowId) {
      return request<ProcedureGraph>(`/v1/workflows/${workflowId}/procedure-graph`);
    },
    async updateProcedureGraph(workflowId, graph) {
      return request<ProcedureGraph>(`/v1/workflows/${workflowId}/procedure-graph`, {
        method: 'PATCH',
        body: JSON.stringify({ graph }),
      });
    },
    async publishProcedure(workflowId, input) {
      return request<ProcedureGraph>(`/v1/workflows/${workflowId}/procedure-graph/publish`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async startDeployment(workflowId) {
      return normalizeDeployment(await request(`/v1/workflows/${workflowId}/deployments`, { method: 'POST' }));
    },
    async getDeployment(deploymentId) {
      return normalizeDeployment(await request(`/v1/deployments/${deploymentId}`));
    },
    async requestRecovery(deploymentId, recoveryStepId) {
      return normalizeDeployment(await request(`/v1/deployments/${deploymentId}/recovery`, {
        method: 'POST',
        body: JSON.stringify({ recoveryStepId }),
      }));
    },
    async observeDeployment(deploymentId, observation) {
      const value = await request<Record<string, unknown>>(`/v1/deployments/${deploymentId}/observations`, {
        method: 'POST',
        body: JSON.stringify(observation),
      });
      return { ...normalizeDeployment(value), decision: String(value.decision ?? 'WAIT'), decisionReason: String(value.decisionReason ?? '') };
    },
  };
}

export function isDemoFixturesEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES === 'true';
}

export function getApiClient(config?: ApiClientConfig) {
  const companyId = process.env.NEXT_PUBLIC_COMPANY_ID?.trim();
  const memberId = process.env.NEXT_PUBLIC_MEMBER_ID?.trim();
  const tenant = config?.tenant ?? (companyId && memberId ? { companyId, memberId } : undefined);
  return createApiClient(config ? { ...config, tenant } : { tenant });
}

export type { ProcedureStep };

