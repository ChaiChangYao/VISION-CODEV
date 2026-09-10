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

export const VoiceStateSchema = z.enum([
  'closed',
  'listening',
  'speaking',
  'interrupted',
  'muted',
  'error',
]);
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
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});
export type MediaObjectReference = z.infer<typeof MediaObjectReferenceSchema>;

export const ProcessingMetadataSchema = z.object({
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  adapterVersion: z.string().min(1),
  promptVersion: z.string().min(1),
  decodingParameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  inputMediaHashes: z.array(z.string().min(1)),
  retrievedEvidenceIds: z.array(IdSchema),
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
  evidenceStartMs: z.number().int().nonnegative().optional(),
  evidenceEndMs: z.number().int().positive().optional(),
  keyframeMs: z.number().int().nonnegative().optional(),
  transcriptExcerpt: z.string().min(1).optional(),
  seniorReview: z.object({
    reviewed: z.boolean(),
    object: z.string(),
    hand: z.enum(['left', 'right', 'both', 'unknown']),
    beforeState: z.string(),
    afterState: z.string(),
    uncertainty: z.string(),
    group: z.string(),
    reasoning: z.string(),
    completionCheck: z.string(),
    documentReferences: z.string(),
    findings: z.array(z.object({
      id: IdSchema, timestampMs: z.number().int().nonnegative(), text: z.string(),
      // Normalized video coordinates, never viewport pixels or altered source media.
      region: z.object({
        x: z.number().min(0).max(1), y: z.number().min(0).max(1),
        radius: z.number().min(0.01).max(0.5),
      }).optional(),
    })).optional(),
  }).optional(),
}).superRefine((value, context) => {
  const timing = [value.evidenceStartMs, value.keyframeMs, value.evidenceEndMs];
  if (timing.some((item) => item !== undefined) && timing.some((item) => item === undefined)) {
    context.addIssue({ code: 'custom', path: ['keyframeMs'], message: 'Generated evidence timing must include start, keyframe, and end.' });
  }
  if (value.evidenceStartMs !== undefined && value.keyframeMs !== undefined && value.keyframeMs < value.evidenceStartMs) {
    context.addIssue({ code: 'custom', path: ['keyframeMs'], message: 'keyframeMs must be within the evidence range.' });
  }
  if (value.keyframeMs !== undefined && value.evidenceEndMs !== undefined && value.keyframeMs > value.evidenceEndMs) {
    context.addIssue({ code: 'custom', path: ['keyframeMs'], message: 'keyframeMs must be within the evidence range.' });
  }
  if (value.evidenceStartMs !== undefined && value.evidenceEndMs !== undefined && value.evidenceEndMs <= value.evidenceStartMs) {
    context.addIssue({ code: 'custom', path: ['evidenceEndMs'], message: 'evidenceEndMs must be greater than evidenceStartMs.' });
  }
});
export type ProcedureStep = z.infer<typeof ProcedureStepSchema>;

export const ProcedureGraphSchema = z.object({
  id: IdSchema,
  version: z.number().int().positive(),
  states: z.array(ProcedureStateSchema),
  steps: z.array(ProcedureStepSchema),
  published: z.boolean(),
  analysis: z.object({ version: z.literal('senior-atomic-v1'), durationMs: z.number().positive(), windowsCompleted: z.number().int().nonnegative(), windowsTotal: z.number().int().positive(), mediaSha256: z.string(), model: z.string() }).optional(),
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
  normalizedGraph: ProcedureGraphSchema.refine(
    (graph) => !graph.published,
    'Processing completion graphs must be unpublished drafts.',
  ),
  metadata: ProcessingMetadataSchema,
  completedAt: TimestampSchema,
});
export type ProcessingCompletion = z.infer<typeof ProcessingCompletionSchema>;

export const AnnotationVerdictSchema = z.enum(['correct', 'deviation', 'uncertain']);
export type AnnotationVerdict = z.infer<typeof AnnotationVerdictSchema>;

export const AnnotationSeveritySchema = z.enum(['info', 'minor', 'major', 'critical']);
export type AnnotationSeverity = z.infer<typeof AnnotationSeveritySchema>;

export const AnnotationReviewStatusSchema = z.enum(['proposed', 'approved', 'rejected']);
export type AnnotationReviewStatus = z.infer<typeof AnnotationReviewStatusSchema>;

export const DocumentEvidenceLocatorSchema = z.object({
  sourceId: z.string().min(1),
  page: z.number().int().positive().optional(),
  region: z.string().min(1).optional(),
  note: z.string().min(1).max(1000).optional(),
});
export type DocumentEvidenceLocator = z.infer<typeof DocumentEvidenceLocatorSchema>;

export const ProcedureAnnotationInputSchema = z
  .object({
    stepId: IdSchema,
    captureSessionId: IdSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    verdict: AnnotationVerdictSchema,
    severity: AnnotationSeveritySchema.optional(),
    objectName: z.string().min(1),
    observedAction: z.string().min(1),
    expectedState: z.string().min(1),
    failureType: z.string().min(1).optional(),
    expectedNextAction: z.string().min(1),
    reasoning: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
    schemaVersion: z.literal(1).optional(),
    documentEvidence: z.array(DocumentEvidenceLocatorSchema),
    origin: z.enum(['model', 'senior']),
    modelProposal: z
      .object({
        modelId: z.string().min(1),
        modelVersion: z.string().min(1),
        confidence: z.number().min(0).max(1),
      })
      .optional(),
    reviewStatus: AnnotationReviewStatusSchema,
  })
  .superRefine((value, context) => {
    if (value.endMs <= value.startMs) {
      context.addIssue({
        code: 'custom',
        path: ['endMs'],
        message: 'endMs must be greater than startMs.',
      });
    }
    if (value.verdict === 'deviation' && !value.failureType) {
      context.addIssue({
        code: 'custom',
        path: ['failureType'],
        message: 'Deviation annotations require a failure type.',
      });
    }
    if (value.origin === 'model' && !value.modelProposal) {
      context.addIssue({
        code: 'custom',
        path: ['modelProposal'],
        message: 'Model annotations require pinned proposal metadata.',
      });
    }
  });
export type ProcedureAnnotationInput = z.infer<typeof ProcedureAnnotationInputSchema>;

export const ProcedureAnnotationSchema = ProcedureAnnotationInputSchema.safeExtend({
  id: IdSchema,
  companyId: CompanyIdSchema,
  workflowId: IdSchema,
  revision: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  reviewedByMemberId: IdSchema.optional(),
  reviewedAt: TimestampSchema.optional(),
});
export type ProcedureAnnotation = z.infer<typeof ProcedureAnnotationSchema>;

export const ReferencePackEntrySchema = z.object({
  annotationId: IdSchema,
  stepId: IdSchema,
  verdict: AnnotationVerdictSchema,
  severity: AnnotationSeveritySchema.optional(),
  media: z.object({
    captureSessionId: IdSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  }),
  comparisonText: z.string().min(1),
  objectName: z.string().min(1),
  observedAction: z.string().min(1),
  expectedState: z.string().min(1),
  failureType: z.string().min(1).optional(),
  expectedNextAction: z.string().min(1),
  reasoning: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  schemaVersion: z.literal(1).optional(),
  documentEvidence: z.array(DocumentEvidenceLocatorSchema),
});
export type ReferencePackEntry = z.infer<typeof ReferencePackEntrySchema>;

export const WorkflowReferencePackSchema = z.object({
  id: IdSchema,
  companyId: CompanyIdSchema,
  workflowId: IdSchema,
  version: z.number().int().positive(),
  procedureVersion: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  annotationIds: z.array(IdSchema).min(1),
  entries: z.array(ReferencePackEntrySchema).min(1),
  coverage: z.object({
    correct: z.number().int().nonnegative(),
    deviation: z.number().int().nonnegative(),
    uncertain: z.number().int().nonnegative(),
    stepIds: z.array(IdSchema),
  }),
  embeddingStatus: z.literal('not_generated'),
  publishedAt: TimestampSchema,
  publishedByMemberId: IdSchema,
});
export type WorkflowReferencePack = z.infer<typeof WorkflowReferencePackSchema>;

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
export type ProbeResult = {
  usable: boolean;
  audio: boolean;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  reason?: string;
};
export type CameraSession = {
  sessionId: string;
  sourceId: string;
  videoUrl?: string;
  audioAvailable: boolean;
  reconnecting: boolean;
};
export type CameraCapabilities = {
  video: boolean;
  audio: boolean;
  ptz: boolean;
  metadata: boolean;
};
export type DeviceHealth = {
  status: 'connected' | 'degraded' | 'disconnected';
  lastSeen: string;
  frameAgeMs?: number;
};
