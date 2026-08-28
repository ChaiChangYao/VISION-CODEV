import { z } from 'zod';

export const CONTRACT_VERSION = '0.1';

export const IdSchema = z.string().uuid();
export const TimestampSchema = z.string().datetime({ offset: true });
export const CompanyIdSchema = IdSchema;

export const ProvenanceClassSchema = z.enum([
  'EXPERT_ASSERTION',
  'SENSOR_OBSERVATION',
  'MODEL_INFERENCE',
  'DOCUMENT_EVIDENCE',
  'REVIEWER_CORRECTION',
  'PUBLISHED_REQUIREMENT',
]);
export type ProvenanceClass = z.infer<typeof ProvenanceClassSchema>;

export const WhyResponseSchema = z.object({
  text: z.string().min(1),
  evidenceIds: z.array(IdSchema),
  procedureVersion: z.number().int().positive(),
  provenance: z.array(ProvenanceClassSchema).min(1),
});
export type WhyResponse = z.infer<typeof WhyResponseSchema>;

export const WorkflowFamilySchema = z.enum(['golden_run', 'camera_automation', 'ambiguous']);
export type WorkflowFamily = z.infer<typeof WorkflowFamilySchema>;

export const WorkflowIntentSchema = z.object({
  family: WorkflowFamilySchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  extractedGoal: z.string().min(1),
  mentionedDevices: z.array(z.string()),
  mentionedConditions: z.array(z.string()),
  mentionedActions: z.array(z.string()),
  missingCriticalFields: z.array(z.string()),
});
export type WorkflowIntent = z.infer<typeof WorkflowIntentSchema>;

export const ErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN_TENANT',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'MEDIA_UNAVAILABLE',
  'PROCESSING_FAILED',
  'EXTERNAL_PROVIDER_UNAVAILABLE',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  traceId: IdSchema,
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ApiEnvelopeSchema = <T extends z.ZodType>(data: T) =>
  z.object({ data, traceId: IdSchema, schemaVersion: z.literal(CONTRACT_VERSION) });

export const TenantContextSchema = z.object({
  companyId: CompanyIdSchema,
  memberId: IdSchema,
});
export type TenantContext = z.infer<typeof TenantContextSchema>;

export const CaptureStateSchema = z.enum([
  'draft',
  'preparing',
  'active',
  'paused',
  'finalizing',
  'processing',
  'completed',
  'failed',
]);
export type CaptureState = z.infer<typeof CaptureStateSchema>;

export const VoiceStateSchema = z.enum(['closed', 'listening', 'speaking', 'interrupted', 'muted', 'error']);
export type VoiceState = z.infer<typeof VoiceStateSchema>;

export const VoiceEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('OPEN') }),
  z.object({ type: z.literal('CLOSE') }),
  z.object({ type: z.literal('GUIDANCE_START'), stepId: z.string().optional() }),
  z.object({ type: z.literal('GUIDANCE_END') }),
  z.object({ type: z.literal('INTERRUPT'), reason: z.string().min(1) }),
  z.object({ type: z.literal('ACKNOWLEDGE') }),
  z.object({ type: z.literal('MUTE') }),
  z.object({ type: z.literal('UNMUTE') }),
  z.object({ type: z.literal('FAIL'), reason: z.string().min(1) }),
]);
export type VoiceEvent = z.infer<typeof VoiceEventSchema>;

export const MediaAssetStateSchema = z.enum([
  'pending',
  'uploading',
  'available',
  'recovery_required',
  'reconciled',
  'failed',
  'deleted',
]);
export type MediaAssetState = z.infer<typeof MediaAssetStateSchema>;

export const MediaObjectReferenceSchema = z.object({
  companyId: CompanyIdSchema,
  objectKey: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});
export type MediaObjectReference = z.infer<typeof MediaObjectReferenceSchema>;

export const ProcessingMetadataSchema = z.object({
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  adapterVersion: z.string().min(1),
  promptVersion: z.string().min(1),
  decodingParameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  inputMediaHashes: z.array(z.string().min(1)),
  retrievedEvidenceIds: z.array(IdSchema)
});
export type ProcessingMetadata = z.infer<typeof ProcessingMetadataSchema>;

export const ProcedureStateSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  predicates: z.array(z.string()),
});
export type ProcedureState = z.infer<typeof ProcedureStateSchema>;

export const ProcedureStepSchema = z.object({
  id: IdSchema,
  ordinalHint: z.number().int().nonnegative(),
  title: z.string().min(1),
  instruction: z.string().min(1),
  observedAction: z.string().min(1),
  evidenceRefs: z.array(IdSchema),
  provenance: z.array(ProvenanceClassSchema),
  startState: z.array(z.string()),
  expectedAction: z.array(z.string()),
  endState: z.array(z.string()),
  allowableVariations: z.array(z.string()),
  deviationRules: z.array(z.string()),
  recoveryTransitions: z.array(IdSchema),
  confidence: z.number().min(0).max(1),
});
export type ProcedureStep = z.infer<typeof ProcedureStepSchema>;

export const ProcedureGraphSchema = z.object({
  id: IdSchema,
  version: z.number().int().positive(),
  states: z.array(ProcedureStateSchema),
  steps: z.array(ProcedureStepSchema),
  published: z.boolean(),
  contentHash: z.string().optional(),
});
export type ProcedureGraph = z.infer<typeof ProcedureGraphSchema>;

export const ProcessingCompletionSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  companyId: CompanyIdSchema,
  workflowId: IdSchema,
  captureSessionId: IdSchema,
  finalized: MediaObjectReferenceSchema,
  transcript: MediaObjectReferenceSchema,
  observations: MediaObjectReferenceSchema,
  procedureDraft: MediaObjectReferenceSchema,
  normalizedGraph: ProcedureGraphSchema.refine((graph) => !graph.published, 'Processing completion graphs must be unpublished drafts.'),
  metadata: ProcessingMetadataSchema,
  completedAt: TimestampSchema,
});
export type ProcessingCompletion = z.infer<typeof ProcessingCompletionSchema>;

export const EventEnvelopeSchema = z.object({
  eventId: IdSchema,
  schemaVersion: z.literal(CONTRACT_VERSION),
  companyId: CompanyIdSchema,
  workflowId: IdSchema.optional(),
  runId: IdSchema.optional(),
  sessionId: IdSchema.optional(),
  source: z.string().min(1),
  mediaTimeMs: z.number().nonnegative().optional(),
  occurredAt: TimestampSchema,
  traceId: IdSchema,
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const CameraAdapterManifestSchema = z.object({
  adapterId: z.string().min(1),
  version: z.string().min(1),
  protocols: z.array(z.string()),
  capabilities: z.array(z.string()),
  requiredSecrets: z.array(z.string()),
  outboundHosts: z.array(z.string()),
  executionLocation: z.enum(['edge', 'server', 'mobile', 'browser']),
  signed: z.boolean(),
});
export type AdapterManifest = z.infer<typeof CameraAdapterManifestSchema>;

export interface CameraAdapter {
  manifest(): AdapterManifest;
  discover(input: DiscoveryInput): AsyncIterable<DiscoveredDevice>;
  probe(config: CameraConnectionConfig): Promise<ProbeResult>;
  connect(config: CameraConnectionConfig): Promise<CameraSession>;
  disconnect(sessionId: string): Promise<void>;
  getCapabilities(sessionId: string): Promise<CameraCapabilities>;
  getHealth(sessionId: string): Promise<DeviceHealth>;
}

export type DiscoveryInput = { companyId: string; siteId?: string };
export type CameraConnectionConfig = { deviceId: string; source: string; secretRef?: string };
export type DiscoveredDevice = { deviceId: string; name: string; source: string };
export type ProbeResult = { usable: boolean; audio: boolean; codec?: string; width?: number; height?: number; fps?: number; reason?: string };
export type CameraSession = { sessionId: string; sourceId: string; videoUrl?: string; audioAvailable: boolean; reconnecting: boolean };
export type CameraCapabilities = { video: boolean; audio: boolean; ptz: boolean; metadata: boolean };
export type DeviceHealth = { status: 'connected' | 'degraded' | 'disconnected'; lastSeen: string; frameAgeMs?: number };

