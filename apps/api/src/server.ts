import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { EgressStatus, WebhookReceiver } from 'livekit-server-sdk';
import { randomInt } from 'node:crypto';
import { URL } from 'node:url';
import { generateUuidV7 } from '@vision-codef/database';
import { ProcessingCompletionSchema, ProcedureAnnotationInputSchema, ProcedureAnnotationSchema, ProcedureGraphSchema, VoiceEventSchema, WhyResponseSchema, WorkflowIntentSchema, type EventEnvelope, type ProcessingCompletion, type ProcedureAnnotation, type ProcedureGraph, type WorkflowIntent } from '@vision-codef/contracts';
import { DevelopmentStore, type CaptureSession, type DeploymentRun, type MediaAsset, type Workflow } from './store.js';
import { evaluatePaperCraneObservation, PAPER_CRANE_POLICY } from './paper-crane.js';
import { issueLiveKitToken } from './livekit-token.js';
import { canonicalObjectKey, getCanonicalEgressConfig, startCanonicalEgress, stopCanonicalEgress } from './livekit-egress.js';
import { describeCaptureProcessing, getProcessingMetadata, startCaptureProcessing } from './processing-client.js';
import { processingReconciliationMessage } from './processing-reconciliation.js';
import { verifyProcessingCompletionSignature } from './processing-webhook.js';
import { createMembershipDirectory } from './membership.js';
import { createConfiguredRuntimePersistence } from './runtime-persistence.js';
import { authenticateRequest } from './auth.js';
import { buildReferencePack } from './reference-pack.js';
import { DEFAULT_MAX_IMPORT_BYTES, importedMediaPath, localMediaRoot, MediaImportError, saveImportedMedia, sha256File } from './local-media.js';
import { parseTenantContext, TenantContextError } from './tenant-context.js';
import { verifyGuidanceServiceBearer } from './guidance-auth.js';
import { classifyWorkflowIntent, resolveWorkflowIntent } from './workflow-intent.js';
import { GraphValidationError, publishProcedureGraph, reduceVoiceState, validateProcedureGraph } from '@vision-codef/workflow-engine';
import type { VoiceEvent } from '@vision-codef/workflow-engine';
const port = Number(process.env.PORT ?? 4000);
const runtimePersistence = createConfiguredRuntimePersistence();
if (process.env.NODE_ENV === 'production' && !runtimePersistence) throw new Error('PostgreSQL runtime persistence must be configured in production.');
const store = new DevelopmentStore(runtimePersistence);
const now = () => new Date().toISOString();
const id = () => generateUuidV7();
const liveKitConfigured = Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
const membershipDirectory = createMembershipDirectory();
const configuredMaxImportBytes = Number(process.env.VISION_CODEF_MAX_IMPORT_BYTES ?? DEFAULT_MAX_IMPORT_BYTES);
const maxImportBytes = Number.isSafeInteger(configuredMaxImportBytes) && configuredMaxImportBytes > 0 ? configuredMaxImportBytes : DEFAULT_MAX_IMPORT_BYTES;
async function processingWorkerHealthy(): Promise<boolean> {
  const endpoint = process.env.PROCESSING_WORKER_HEALTH_URL;
  if (!endpoint) return true;
  try { return (await fetch(endpoint, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
async function reconcileCaptureProcessing(capture: CaptureSession, workflow: Workflow): Promise<void> {
  if (capture.processingStatus !== 'submitted' || !capture.processingWorkflowId) return;
  let executionStatus;
  try { executionStatus = await describeCaptureProcessing(capture.processingWorkflowId); } catch { return; }
  const reconciliationMessage = processingReconciliationMessage(executionStatus);
  if (!reconciliationMessage) return;
  capture.processingBlockReason = reconciliationMessage;
  capture.processingStatus = 'failed'; capture.processingStage = 'failed'; capture.processingMessage = capture.processingBlockReason; capture.processingHeartbeatAt = now(); capture.state = 'completed'; workflow.status = 'Processing Failed';
  event(capture.companyId, 'capture.processing.reconciled', { executionStatus }, capture.workflowId, capture.id);
}
function deploymentView(run: DeploymentRun) { const workflow = getWorkflow(run.workflowId, run.companyId); const graph = workflow.graph; const step = graph?.steps[run.currentStep]; const why = graph && step ? WhyResponseSchema.parse({ text: `This instruction is taken from approved procedure version ${graph.version}.`, evidenceIds: step.evidenceRefs, procedureVersion: graph.version, provenance: step.provenance }) : undefined; return { ...run, status: run.status === 'active' ? 'monitoring' : run.status, totalSteps: graph?.steps.length ?? 0, currentInstruction: step?.instruction, intervention: run.intervention, why }; }

function parseVoiceEvent(payload: Record<string, unknown>): VoiceEvent {
  const result = VoiceEventSchema.safeParse(payload);
  if (!result.success) throw new HttpError(400, 'VALIDATION_FAILED', 'Unsupported or incomplete voice event.');
  return result.data;
}
async function readBody(request: IncomingMessage): Promise<string> { let raw = ''; for await (const chunk of request) raw += chunk; return raw; }
async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> { const raw = await readBody(request); if (!raw) return {}; try { return JSON.parse(raw) as Record<string, unknown>; } catch { throw new HttpError(400, 'VALIDATION_FAILED', 'Request body must be valid JSON.'); } }
class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
function send(response: ServerResponse, status: number, data: unknown, traceId = id()) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-company-id, x-member-id, idempotency-key' }); response.end(JSON.stringify({ data, traceId, schemaVersion: '0.1' })); }
function event(companyId: string, eventType: string, payload: Record<string, unknown>, workflowId?: string, sessionId?: string, runId?: string) { const value: EventEnvelope = { eventId: id(), schemaVersion: '0.1', companyId, workflowId, sessionId, runId, source: 'api', occurredAt: now(), traceId: id(), eventType, payload }; store.events.push(value); return value; }
function getWorkflow(value: string, expectedCompanyId: string) { const workflow = store.workflows.get(value); if (!workflow || workflow.companyId !== expectedCompanyId) throw new HttpError(404, 'NOT_FOUND', 'Workflow was not found.'); return workflow; }
function getCapture(value: string, expectedCompanyId: string) { const capture = store.captures.get(value); if (!capture || capture.companyId !== expectedCompanyId) throw new HttpError(404, 'NOT_FOUND', 'Capture session was not found.'); return capture; }
function getMediaAsset(value: string, expectedCompanyId: string) { const asset = store.mediaAssets.get(value); if (!asset || asset.companyId !== expectedCompanyId) throw new HttpError(404, 'NOT_FOUND', 'Media asset was not found.'); return asset; }
function mediaAssetView(asset: MediaAsset | undefined) {
  if (!asset) return undefined;
  const { localPath: _localPath, ...view } = asset;
  return { ...view, contentAvailable: Boolean(asset.localPath) || (asset.state === 'available' && Boolean(canonicalMediaClient())) };
}
function captureView(capture: CaptureSession) {
  return {
    ...capture,
    connectionStatus: capture.state === 'active' ? 'connecting' : 'disconnected',
    roomName: `company-${capture.companyId}-workflow-${capture.workflowId}`,
    mediaAsset: capture.mediaAssetId ? mediaAssetView(store.mediaAssets.get(capture.mediaAssetId)) : undefined,
  };
}
async function sendMediaContent(response: ServerResponse, asset: MediaAsset): Promise<void> {
  if (asset.localPath && asset.storageKind === 'local_import') {
    let metadata;
    try { metadata = await stat(asset.localPath); } catch { throw new HttpError(404, 'MEDIA_UNAVAILABLE', 'The imported media file is no longer available.'); }
    response.writeHead(200, { 'content-type': asset.contentType ?? 'video/mp4', 'content-length': metadata.size, 'cache-control': 'private, no-store', 'access-control-allow-origin': '*' });
    await new Promise<void>((resolveStream, rejectStream) => { const stream = createReadStream(asset.localPath!); stream.on('error', rejectStream); stream.on('end', resolveStream); stream.pipe(response); });
    return;
  }
  const storage = canonicalMediaClient();
  if (!storage || asset.state !== 'available') throw new HttpError(412, 'MEDIA_UNAVAILABLE', 'The canonical recording is not available yet.');
  let object;
  try { object = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: asset.objectKey })); }
  catch { throw new HttpError(404, 'MEDIA_UNAVAILABLE', 'The canonical recording could not be read from storage.'); }
  if (!object.Body) throw new HttpError(404, 'MEDIA_UNAVAILABLE', 'The canonical recording is empty.');
  response.writeHead(200, { 'content-type': object.ContentType ?? asset.contentType ?? 'video/mp4', ...(object.ContentLength ? { 'content-length': object.ContentLength } : {}), 'cache-control': 'private, no-store', 'access-control-allow-origin': '*' });
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) response.write(chunk);
  response.end();
}

let cachedCanonicalMedia: { client: S3Client; bucket: string } | undefined;
function canonicalMediaClient(): { client: S3Client; bucket: string } | undefined {
  if (cachedCanonicalMedia) return cachedCanonicalMedia;
  const bucket = process.env.S3_BUCKET ?? process.env.LIVEKIT_EGRESS_S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY ?? process.env.LIVEKIT_EGRESS_S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY ?? process.env.LIVEKIT_EGRESS_S3_SECRET;
  if (!bucket || !accessKeyId || !secretAccessKey) return undefined;
  cachedCanonicalMedia = { bucket, client: new S3Client({ region: process.env.S3_REGION ?? process.env.LIVEKIT_EGRESS_S3_REGION ?? 'us-east-1', endpoint: process.env.S3_ENDPOINT ?? process.env.LIVEKIT_EGRESS_S3_ENDPOINT, forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? process.env.LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE) === 'true', credentials: { accessKeyId, secretAccessKey } }) };
  return cachedCanonicalMedia;
}
function getDeployment(value: string, expectedCompanyId: string) { const run = store.deployments.get(value); if (!run || run.companyId !== expectedCompanyId) throw new HttpError(404, 'NOT_FOUND', 'Deployment run was not found.'); return run; }
function getAnnotation(value: string, expectedCompanyId: string) { const annotation = store.annotations.get(value); if (!annotation || annotation.companyId !== expectedCompanyId) throw new HttpError(404, 'NOT_FOUND', 'Procedure annotation was not found.'); return annotation; }
function annotationsForWorkflow(workflowId: string, companyId: string) { return [...store.annotations.values()].filter((value) => value.companyId === companyId && value.workflowId === workflowId).sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id)); }
function referencePacksForWorkflow(workflowId: string, companyId: string) { return [...store.referencePacks.values()].filter((value) => value.companyId === companyId && value.workflowId === workflowId).sort((left, right) => right.version - left.version); }

function reviewedAnnotation(
  input: unknown,
  identity: { id: string; companyId: string; workflowId: string; memberId: string; revision: number; createdAt: string },
): ProcedureAnnotation {
  const parsed = ProcedureAnnotationInputSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_FAILED', parsed.error.message);
  const timestamp = now();
  const reviewed = parsed.data.reviewStatus === 'proposed' ? {} : { reviewedByMemberId: identity.memberId, reviewedAt: timestamp };
  return ProcedureAnnotationSchema.parse({
    ...parsed.data,
    id: identity.id,
    companyId: identity.companyId,
    workflowId: identity.workflowId,
    revision: identity.revision,
    createdAt: identity.createdAt,
    updatedAt: timestamp,
    ...reviewed,
  });
}

async function monitorView(capture: CaptureSession, companyId: string, memberId: string) {
  const token = liveKitConfigured
    ? await issueLiveKitToken({ companyId, memberId, workflowId: capture.workflowId, sessionId: capture.id, role: 'viewer' })
    : undefined;
  return {
    sessionId: capture.id,
    roomName: 'company-' + companyId + '-workflow-' + capture.workflowId,
    serverUrl: process.env.LIVEKIT_URL ?? '',
    viewerToken: token?.token ?? '',
    status: liveKitConfigured ? 'waiting' : 'disconnected',
    audioConnected: false,
    videoConnected: false,
    reason: liveKitConfigured ? 'Waiting for phone publisher.' : 'LiveKit credentials are not configured.',
  };
}

async function queueCaptureProcessing(capture: CaptureSession, asset: MediaAsset | undefined, companyId: string, force = false): Promise<void> {
  const maxAttempts = 5;
  if (!force && (capture.processingStatus === 'submitted' || capture.processingStatus === 'completed')) return;
  const workflow = getWorkflow(capture.workflowId, companyId);
  capture.state = 'processing';
  workflow.status = 'Processing';
  workflow.updatedAt = now();
  if (!asset?.egressId && asset?.storageKind !== 'local_import') {
    capture.processingStatus = 'blocked';
    capture.processingBlockReason = 'Canonical LiveKit Egress is not available.';
    return;
  }
  if (asset.state !== 'available') {
    capture.processingStatus = 'blocked';
    capture.processingBlockReason = 'Canonical media object is not available yet.';
    return;
  }
  const metadata = getProcessingMetadata();
  if (!metadata) {
    capture.processingStatus = 'blocked';
    capture.processingBlockReason = 'Pinned processing metadata is not configured.';
    return;
  }
  if ((capture.processingAttemptCount ?? 0) >= maxAttempts) {
    capture.state = 'failed';
    capture.processingStatus = 'failed';
    capture.processingBlockReason = `Processing stopped after ${maxAttempts} attempts. The original recording is preserved.`;
    workflow.status = 'Processing Failed';
    return;
  }
  capture.processingAttemptCount = (capture.processingAttemptCount ?? 0) + 1;
  capture.processingStage = 'queued';
  capture.processingProgress = 5;
  capture.processingMessage = 'Waiting for the processing worker.';
  capture.processingHeartbeatAt = now();
  try {
    const handle = await startCaptureProcessing({
      companyId,
      workflowId: capture.workflowId,
      captureSessionId: capture.id,
      media: { companyId, objectKey: asset.objectKey, ...(asset.sha256 ? { sha256: asset.sha256 } : {}) },
      metadata: asset.sha256 ? { ...metadata, inputMediaHashes: [asset.sha256] } : metadata,
      idempotencyKey: `capture.finalize:${capture.id}:attempt:${capture.processingAttemptCount}`,
    });
    capture.processingWorkflowId = handle?.workflowId;
    capture.processingRunId = handle?.runId;
    capture.processingSubmittedAt = handle ? now() : undefined;
    capture.processingStatus = handle ? 'submitted' : 'blocked';
    capture.processingBlockReason = handle ? undefined : 'Temporal processing is not configured.';
  } catch (error) {
    capture.state = 'failed';
    workflow.status = 'Processing Failed';
    if (asset.storageKind !== 'local_import') asset.state = 'failed';
    capture.processingStatus = 'failed';
    capture.processingBlockReason = error instanceof Error ? error.message : 'Temporal workflow submission failed.';
    event(companyId, 'capture.processing.failed', { state: capture.state, reason: capture.processingBlockReason, attempt: capture.processingAttemptCount, maxAttempts }, capture.workflowId, capture.id);
  }
}
function applyProcessingCompletion(input: ProcessingCompletion): { duplicate: boolean; capture: CaptureSession; workflow: Workflow } {
  const objectPrefix = 'companies/' + input.companyId + '/';
  const references = [input.finalized, input.transcript, input.observations, input.procedureDraft];
  if (references.some((reference) => reference.companyId !== input.companyId || !reference.objectKey.startsWith(objectPrefix))) throw new HttpError(403, 'FORBIDDEN_TENANT', 'Processing artifacts must belong to the completion company.');
  const capture = store.captures.get(input.captureSessionId);
  if (!capture || capture.companyId !== input.companyId || capture.workflowId !== input.workflowId) throw new HttpError(404, 'NOT_FOUND', 'The processing capture session was not found.');
  const asset = capture.mediaAssetId ? store.mediaAssets.get(capture.mediaAssetId) : undefined;
  if (!asset || asset.companyId !== input.companyId || asset.objectKey !== input.finalized.objectKey || asset.state !== 'available') throw new HttpError(409, 'CONFLICT', 'Processing completion does not match an available canonical media asset.');
  const workflow = getWorkflow(capture.workflowId, input.companyId);
  if (capture.processingStatus === 'completed') return { duplicate: true, capture, workflow };
  capture.state = 'completed';
  capture.processingStatus = 'completed';
  capture.processingBlockReason = undefined;
  capture.processingStage = 'completed';
  capture.processingProgress = 100;
  capture.processingMessage = 'Procedure graph draft is ready.';
  capture.processingHeartbeatAt = now();
  capture.processingMetadata = input.metadata;
  capture.processingArtifacts = { finalized: input.finalized, transcript: input.transcript, observations: input.observations, procedureDraft: input.procedureDraft };
  workflow.graph = { ...input.normalizedGraph, published: false };
  workflow.status = 'Needs Review';
  workflow.updatedAt = now();
  event(input.companyId, 'capture.processing.completed', { state: capture.state, procedureGraphVersion: workflow.graph.version }, workflow.id, capture.id);
  return { duplicate: false, capture, workflow };
}
async function route(request: IncomingMessage, response: ServerResponse) {
  const traceId = id(); const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`); const method = request.method ?? 'GET';
  if (method === 'OPTIONS') { send(response, 204, null, traceId); return; }
  if (url.pathname === '/health' && method === 'GET') { send(response, 200, { status: 'ok', service: 'api', time: now() }, traceId); return; }
  const path = url.pathname.startsWith('/api/v1/') ? url.pathname.slice(4) : url.pathname;
  if (!path.startsWith('/v1/')) throw new HttpError(404, 'NOT_FOUND', 'Route was not found.');
  if (path === '/v1/internal/guidance-token' && method === 'POST') {
    const secret = process.env.VISION_CODEF_GUIDANCE_SERVICE_SECRET;
    if (!secret) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'Guidance service authentication is not configured.');
    if (!verifyGuidanceServiceBearer(request.headers.authorization, secret)) throw new HttpError(401, 'UNAUTHENTICATED', 'Guidance service authentication failed.');
    const input = await readJson(request);
    const companyId = String(input.companyId ?? '');
    const memberId = String(input.memberId ?? '');
    const workflowId = String(input.workflowId ?? '');
    const deploymentId = String(input.deploymentId ?? '');
    const tenantResult = parseTenantContext({ 'x-company-id': companyId, 'x-member-id': memberId });
    if (!membershipDirectory.has(tenantResult)) throw new HttpError(403, 'FORBIDDEN_TENANT', 'The guidance service member is not a member of this company.');
    const deployment = getDeployment(deploymentId, companyId);
    if (deployment.workflowId !== workflowId) throw new HttpError(403, 'FORBIDDEN_TENANT', 'The deployment does not belong to the requested workflow.');
    const workflow = getWorkflow(workflowId, companyId);
    if (!workflow.graph?.published || workflow.status !== 'Published') throw new HttpError(412, 'PRECONDITION_FAILED', 'A published procedure is required before realtime guidance can join.');
    if (!liveKitConfigured) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'LiveKit credentials are not configured.');
    const issued = await issueLiveKitToken({ companyId, memberId, workflowId, sessionId: deploymentId, role: 'guidance' });
    send(response, 200, { ...issued, deploymentId, observationPath: `/v1/deployments/${deploymentId}/observations` }, traceId);
    return;
  }
  if (path === '/v1/internal/processing-completions' && method === 'POST') { const raw = await readBody(request); const secret = process.env.VISION_CODEF_PROCESSING_WEBHOOK_SECRET; if (!secret) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'Processing completion verification is not configured.'); const signature = request.headers['x-vision-codef-signature']; if (Array.isArray(signature) || !verifyProcessingCompletionSignature(raw, signature, secret)) throw new HttpError(401, 'UNAUTHENTICATED', 'Processing completion signature verification failed.'); let input: ProcessingCompletion; try { input = ProcessingCompletionSchema.parse(JSON.parse(raw)); } catch (error) { throw new HttpError(400, 'VALIDATION_FAILED', error instanceof Error ? error.message : 'Processing completion payload is invalid.'); } const result = applyProcessingCompletion(input); send(response, 200, { accepted: true, duplicate: result.duplicate, captureSessionId: result.capture.id, workflowId: result.workflow.id, processingStatus: result.capture.processingStatus }, traceId); return; }
  if (path === '/v1/internal/processing-progress' && method === 'POST') {
    const raw = await readBody(request); const secret = process.env.VISION_CODEF_PROCESSING_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'Processing progress verification is not configured.');
    const signature = request.headers['x-vision-codef-signature'];
    if (Array.isArray(signature) || !verifyProcessingCompletionSignature(raw, signature, secret)) throw new HttpError(401, 'UNAUTHENTICATED', 'Processing progress signature verification failed.');
    const input = JSON.parse(raw) as Record<string, unknown>;
    const capture = getCapture(String(input.captureSessionId ?? ''), String(input.companyId ?? ''));
    if (capture.workflowId !== String(input.workflowId ?? '')) throw new HttpError(403, 'FORBIDDEN_TENANT', 'Processing progress does not match the capture workflow.');
    const progress = Number(input.progress);
    if (!Number.isFinite(progress) || progress < 0 || progress > 99) throw new HttpError(400, 'VALIDATION_FAILED', 'Processing progress must be between 0 and 99.');
    capture.processingStage = String(input.stage ?? 'processing'); capture.processingProgress = Math.round(progress); capture.processingMessage = String(input.message ?? 'Processing recording.').slice(0, 500); capture.processingHeartbeatAt = now();
    if (capture.processingStage === 'failed') { capture.processingStatus = 'failed'; capture.processingBlockReason = capture.processingMessage; capture.state = 'completed'; getWorkflow(capture.workflowId, capture.companyId).status = 'Processing Failed'; }
    event(capture.companyId, 'capture.processing.progressed', { stage: capture.processingStage, progress: capture.processingProgress }, capture.workflowId, capture.id);
    send(response, 200, { accepted: true, captureSessionId: capture.id, stage: capture.processingStage, progress: capture.processingProgress }, traceId); return;
  }
  if (path === '/v1/webhooks/livekit' && method === 'POST') { const raw = await readBody(request); const apiKey = process.env.LIVEKIT_WEBHOOK_API_KEY ?? process.env.LIVEKIT_API_KEY; const apiSecret = process.env.LIVEKIT_WEBHOOK_API_SECRET ?? process.env.LIVEKIT_API_SECRET; if (!apiKey || !apiSecret) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'LiveKit webhook verification is not configured.'); let webhook; try { webhook = await new WebhookReceiver(apiKey, apiSecret).receive(raw, request.headers.authorization); } catch (error) { throw new HttpError(401, 'UNAUTHENTICATED', error instanceof Error ? error.message : 'LiveKit webhook verification failed.'); } if (webhook.event !== 'egress_ended' || !webhook.egressInfo) { send(response, 200, { received: true, handled: false, event: webhook.event }, traceId); return; } const info = webhook.egressInfo; const asset = [...store.mediaAssets.values()].find((value) => value.egressId === info.egressId); if (!asset) { send(response, 202, { received: true, handled: false, reason: 'No matching media asset.' }, traceId); return; } const capture = getCapture(asset.captureSessionId, asset.companyId); if (info.status === EgressStatus.EGRESS_COMPLETE && !info.error) { asset.state = 'available'; await queueCaptureProcessing(capture, asset, asset.companyId); } else { asset.state = 'failed'; capture.state = 'failed'; capture.processingStatus = 'failed'; capture.processingBlockReason = info.error || 'LiveKit Egress ended without a complete media object.'; getWorkflow(capture.workflowId, asset.companyId).status = 'Processing Failed'; } event(asset.companyId, 'capture.egress.ended', { egressId: info.egressId, status: info.status, mediaAssetState: asset.state, processingStatus: capture.processingStatus }, capture.workflowId, capture.id); send(response, 200, { received: true, handled: true, egressId: info.egressId, mediaAsset: asset, processingStatus: capture.processingStatus }, traceId); return; }
  const headerTenant = parseTenantContext(request.headers); let tenant; try { tenant = authenticateRequest(request.headers, headerTenant); } catch (error) { throw new HttpError(401, 'UNAUTHENTICATED', error instanceof Error ? error.message : 'Request authentication failed.'); } const { companyId, memberId } = tenant; if (!membershipDirectory.has(tenant)) throw new HttpError(403, 'FORBIDDEN', 'The authenticated member is not a member of this company.');
  const parts = path.split('/').filter(Boolean).slice(1);
  const isMediaImport = parts[0] === 'workflows' && parts[2] === 'capture-sessions' && parts[3] === 'import' && parts.length === 4 && method === 'POST';
  const payload = ['POST', 'PATCH', 'PUT'].includes(method) && !isMediaImport ? await readJson(request) : {};
  if (parts[0] === 'workflows' && parts[2] === 'procedure-graph' && (method === 'PATCH' || method === 'POST')) {
    const existing = getWorkflow(parts[1]!, companyId).graph;
    if (existing?.analysis && payload.graph) {
      const incoming = payload.graph as ProcedureGraph;
      if (JSON.stringify(incoming.analysis) !== JSON.stringify(existing.analysis)) throw new HttpError(400, 'VALIDATION_FAILED', 'Source analysis metadata cannot be removed or changed during review.');
    }
  }
  if (parts[0] === 'capture-token' && parts.length === 1 && method === 'POST') { const sessionId = String(payload.sessionId ?? ''); const workflowId = String(payload.workflowId ?? ''); const deviceId = String(payload.deviceId ?? ''); const capture = getCapture(sessionId, companyId); if (workflowId !== capture.workflowId) throw new HttpError(403, 'FORBIDDEN_TENANT', 'The capture session does not belong to the requested workflow.'); if (String(payload.memberId ?? '') !== memberId) throw new HttpError(403, 'FORBIDDEN_TENANT', 'The token member must match the authenticated request member.'); if (!capture.pairedDeviceId || !deviceId || deviceId !== capture.pairedDeviceId) throw new HttpError(403, 'FORBIDDEN_TENANT', 'The phone must claim this capture session before a publisher token is issued.'); if (!liveKitConfigured) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'LiveKit credentials are not configured.'); const issued = await issueLiveKitToken({ companyId, memberId, workflowId: capture.workflowId, sessionId: capture.id, role: 'publisher' }); send(response, 200, issued, traceId); return; }
  if (parts[0] === 'workflows' && parts[1] === 'intent' && method === 'POST') { send(response, 200, classifyWorkflowIntent(String(payload.brief ?? payload.text ?? '')), traceId); return; }
  if (parts[0] === 'workflows' && parts.length === 1 && method === 'GET') { send(response, 200, [...store.workflows.values()].filter((value) => value.companyId === companyId), traceId); return; }
  if (parts[0] === 'workflows' && parts.length === 1 && method === 'POST') { const objective = String(payload.brief ?? payload.objective ?? payload.message ?? '').trim(); if (!objective) throw new HttpError(400, 'VALIDATION_FAILED', 'brief is required.'); const intent = resolveWorkflowIntent(objective, payload.family); if (intent.family === 'ambiguous') { send(response, 200, { intent, requiresClarification: true }, traceId); return; } const workflow: Workflow = { id: id(), companyId, title: objective.slice(0, 72), family: intent.family, objective, status: 'Draft', createdAt: now(), updatedAt: now() }; store.workflows.set(workflow.id, workflow); event(companyId, 'workflow.created', { intent }, workflow.id); send(response, 201, { ...workflow, intent, stage: 'train', description: objective }, traceId); return; }
  if (parts[0] === 'workflows' && parts.length === 2 && method === 'GET') { const workflow = getWorkflow(parts[1]!, companyId); send(response, 200, { ...workflow, stage: workflow.status === 'Published' ? 'deploy' : 'train', description: workflow.objective }, traceId); return; }
  if (parts[0] === 'capture-pairings' && parts[1] === 'claim' && parts.length === 2 && method === 'POST') { const pairingCode = String(payload.pairingCode ?? '').trim(); const deviceId = String(payload.deviceId ?? '').trim(); if (!/^\d{6}$/.test(pairingCode) || !deviceId) throw new HttpError(400, 'VALIDATION_FAILED', 'A six-digit pairingCode and deviceId are required.'); const capture = [...store.captures.values()].find((value) => value.companyId === companyId && value.pairingCode === pairingCode); if (!capture?.pairingExpiresAt || Date.parse(capture.pairingExpiresAt) <= Date.now()) throw new HttpError(401, 'UNAUTHENTICATED', 'The pairing code is invalid or expired.'); if (capture.pairedDeviceId && capture.pairedDeviceId !== deviceId) throw new HttpError(409, 'CONFLICT', 'This capture session is already paired to another device.'); capture.pairedDeviceId = deviceId; capture.pairedAt ??= now(); event(companyId, 'capture.paired', { deviceId }, capture.workflowId, capture.id); send(response, 200, { sessionId: capture.id, workflowId: capture.workflowId, deviceId, roomName: `company-${companyId}-workflow-${capture.workflowId}` }, traceId); return; }
  if (isMediaImport) {
    const workflow = getWorkflow(parts[1]!, companyId);
    if (workflow.family !== 'golden_run') throw new HttpError(409, 'CONFLICT', 'Only Golden Run workflows can import captured media.');
    const originalFilename = url.searchParams.get('filename')?.trim() ?? '';
    const contentType = String(request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!originalFilename || !/\.mp4$/i.test(originalFilename) || (contentType !== 'video/mp4' && contentType !== 'application/octet-stream')) throw new HttpError(400, 'VALIDATION_FAILED', 'Select an MP4 video file.');
    const declaredBytes = Number(request.headers['content-length'] ?? 0);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxImportBytes) throw new HttpError(413, 'MEDIA_TOO_LARGE', `Imported videos must be ${Math.floor(maxImportBytes / 1024 / 1024)} MB or smaller.`);
    const captureId = id(); const assetId = id(); const timestamp = now();
    const durationValue = Number(url.searchParams.get('durationMs') ?? 0);
    const durationMs = Number.isFinite(durationValue) && durationValue > 0 ? Math.round(durationValue) : undefined;
    const target = importedMediaPath(localMediaRoot(), companyId, captureId, assetId);
    let sizeBytes: number;
    try { sizeBytes = await saveImportedMedia(request, target, maxImportBytes); } catch (error) { if (error instanceof MediaImportError) throw new HttpError(error.code === 'MEDIA_TOO_LARGE' ? 413 : 400, error.code, error.message); throw error; }
    const sha256 = await sha256File(target);
    const objectKey = `companies/${companyId}/captures/${captureId}/imports/${assetId}.mp4`;
    const asset: MediaAsset = { id: assetId, companyId, captureSessionId: captureId, state: 'available', objectKey, storageKind: 'local_import', originalFilename, contentType: 'video/mp4', sizeBytes, sha256, localPath: target };
    const capture: CaptureSession = { id: captureId, workflowId: workflow.id, companyId, state: 'processing', source: 'import', startedAt: timestamp, endedAt: timestamp, durationMs, mediaAssetId: asset.id };
    store.mediaAssets.set(asset.id, asset); store.captures.set(capture.id, capture); workflow.updatedAt = timestamp; if (workflow.graph) workflow.status = 'Needs Review';
    const storage = canonicalMediaClient();
    if (storage) {
      try {
        await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: objectKey, Body: createReadStream(target), ContentType: 'video/mp4', Metadata: { sha256 } }));
        const uploaded = await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: objectKey }));
        if (uploaded.ContentLength !== sizeBytes || uploaded.Metadata?.sha256 !== sha256) throw new Error('The uploaded MP4 failed size or checksum verification.');
        await queueCaptureProcessing(capture, asset, companyId);
      } catch (error) {
        capture.state = 'completed';
        capture.processingStatus = 'blocked';
        capture.processingBlockReason = error instanceof Error ? `Imported MP4 processing could not start: ${error.message}` : 'Imported MP4 processing could not start.';
      }
    } else {
      capture.state = 'completed';
      capture.processingStatus = 'blocked';
      capture.processingBlockReason = 'Imported MP4 is ready for review, but canonical processing storage is not configured.';
    }
    event(companyId, 'capture.imported', { filename: originalFilename, contentType: asset.contentType, sizeBytes, durationMs }, workflow.id, capture.id);
    send(response, 201, captureView(capture), traceId); return;
  }
  if (parts[0] === 'workflows' && parts[2] === 'capture-sessions' && parts.length === 3 && method === 'POST') { const workflow = getWorkflow(parts[1]!, companyId); if (workflow.family !== 'golden_run') throw new HttpError(409, 'CONFLICT', 'Only Golden Run workflows can capture.'); const capture: CaptureSession = { id: id(), workflowId: workflow.id, companyId, state: 'preparing', source: 'phone', pairingCode: String(randomInt(100000, 1000000)), pairingExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }; store.captures.set(capture.id, capture); event(companyId, 'capture.created', { state: capture.state }, workflow.id, capture.id); send(response, 201, captureView(capture), traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'capture-sessions' && parts.length === 3 && method === 'GET') { const workflow = getWorkflow(parts[1]!, companyId); const captures = [...store.captures.values()].filter((value) => value.companyId === companyId && value.workflowId === workflow.id).sort((left, right) => (right.endedAt ?? right.startedAt ?? right.pairingExpiresAt ?? '').localeCompare(left.endedAt ?? left.startedAt ?? left.pairingExpiresAt ?? '')); send(response, 200, captures.map(captureView), traceId); return; }
  if (parts[0] === 'capture-sessions' && parts.length === 2 && method === 'GET') { const capture = getCapture(parts[1]!, companyId); send(response, 200, captureView(capture), traceId); return; }
  if (parts[0] === 'capture-sessions' && parts[2] === 'start' && parts.length === 3 && method === 'POST') { const capture = getCapture(parts[1]!, companyId); const existingAsset = capture.mediaAssetId ? store.mediaAssets.get(capture.mediaAssetId) : undefined; if (capture.state === 'active' && existingAsset) { send(response, 200, { ...capture, connectionStatus: 'connecting', roomName: 'company-' + companyId + '-workflow-' + capture.workflowId, mediaAsset: existingAsset, egressStatus: existingAsset.egressId ? 'recording' : 'blocked' }, traceId); return; } if (capture.state !== 'preparing') throw new HttpError(409, 'CONFLICT', 'The capture session is not ready to start.'); if (!capture.pairedDeviceId) throw new HttpError(409, 'CONFLICT', 'Claim the capture session from the native phone before starting capture.'); const workflow = getWorkflow(capture.workflowId, companyId); const objectKey = canonicalObjectKey(companyId, capture.id); const asset: MediaAsset = { id: id(), companyId, captureSessionId: capture.id, state: 'pending', objectKey }; if (getCanonicalEgressConfig()) { try { const egress = await startCanonicalEgress({ companyId, workflowId: capture.workflowId, sessionId: capture.id }); capture.egressId = egress.egressId; asset.egressId = egress.egressId; asset.state = 'uploading'; } catch (error) { throw new HttpError(502, 'EXTERNAL_PROVIDER_UNAVAILABLE', error instanceof Error ? error.message : 'Canonical LiveKit Egress could not start.'); } } store.mediaAssets.set(asset.id, asset); capture.mediaAssetId = asset.id; capture.state = 'active'; capture.startedAt ??= now(); workflow.status = 'Capturing'; workflow.updatedAt = now(); event(companyId, 'capture.started', { state: capture.state, egressStatus: asset.egressId ? 'recording' : 'blocked' }, capture.workflowId, capture.id); send(response, 200, { ...capture, connectionStatus: 'connecting', roomName: 'company-' + companyId + '-workflow-' + capture.workflowId, mediaAsset: asset, egressStatus: asset.egressId ? 'recording' : 'blocked' }, traceId); return; }
  if (parts[0] === 'capture-sessions' && parts[2] === 'stop' && parts.length === 3 && method === 'POST') { const capture = getCapture(parts[1]!, companyId); const existingAsset = capture.mediaAssetId ? store.mediaAssets.get(capture.mediaAssetId) : undefined; if (capture.state === 'finalizing' || capture.state === 'processing' || capture.state === 'completed') { send(response, 200, { ...capture, connectionStatus: 'disconnected', mediaAsset: existingAsset, egressStatus: existingAsset?.state === 'available' ? 'available' : capture.egressId ? 'stopped_waiting_for_object' : 'blocked' }, traceId); return; } if (capture.state !== 'active' && capture.state !== 'paused') throw new HttpError(409, 'CONFLICT', 'The capture session is not active.'); if (capture.egressId) { try { await stopCanonicalEgress(capture.egressId); } catch (error) { throw new HttpError(502, 'EXTERNAL_PROVIDER_UNAVAILABLE', error instanceof Error ? error.message : 'Canonical LiveKit Egress could not stop.'); } } const workflow = getWorkflow(capture.workflowId, companyId); capture.state = capture.egressId ? 'finalizing' : 'processing'; capture.endedAt = now(); workflow.status = 'Processing'; workflow.updatedAt = now(); const asset = capture.mediaAssetId ? store.mediaAssets.get(capture.mediaAssetId) : undefined; if (asset) asset.state = 'pending'; if (!capture.egressId) await queueCaptureProcessing(capture, asset, companyId); event(companyId, 'capture.ended', { state: capture.state, egressStatus: capture.egressId ? 'stopped_waiting_for_object' : 'blocked', processingStatus: capture.processingStatus }, capture.workflowId, capture.id); send(response, 200, { ...capture, connectionStatus: 'disconnected', mediaAsset: asset, egressStatus: capture.egressId ? 'stopped_waiting_for_object' : 'blocked' }, traceId); return; }
  if (parts[0] === 'capture-sessions' && parts[2] === 'monitor' && parts.length === 3 && method === 'GET') { const capture = getCapture(parts[1]!, companyId); send(response, 200, await monitorView(capture, companyId, memberId), traceId); return; }
  if (parts[0] === 'media-assets' && parts[2] === 'content' && parts.length === 3 && method === 'GET') { await sendMediaContent(response, getMediaAsset(parts[1]!, companyId)); return; }
  if (parts[0] === 'media-assets' && parts.length === 2 && method === 'GET') { send(response, 200, mediaAssetView(getMediaAsset(parts[1]!, companyId)), traceId); return; }
  if (parts[0] === 'capture-sessions' && parts[2] === 'processing' && parts.length === 3 && method === 'GET') {
    const capture = getCapture(parts[1]!, companyId);
    await reconcileCaptureProcessing(capture, getWorkflow(capture.workflowId, companyId));
  }
  if (parts[0] === 'capture-sessions' && parts[2] === 'processing' && parts.length === 3 && method === 'GET') { const capture = getCapture(parts[1]!, companyId); const workflow = getWorkflow(capture.workflowId, companyId); const heartbeatAt = capture.processingHeartbeatAt ?? capture.processingSubmittedAt ?? capture.endedAt; if (capture.processingStatus === 'submitted' && heartbeatAt && Date.now() - Date.parse(heartbeatAt) > 15 * 60 * 1000) { capture.processingStatus = 'failed'; capture.processingStage = 'failed'; capture.processingBlockReason = 'No processing heartbeat was received for 15 minutes. Retry the preserved recording.'; workflow.status = 'Processing Failed'; event(companyId, 'capture.processing.timed_out', { heartbeatAt }, capture.workflowId, capture.id); } const status = capture.processingStatus === 'completed' ? 'completed' : capture.processingStatus === 'failed' ? 'failed' : capture.processingStatus === 'blocked' ? 'blocked' : 'queued'; const workerHealthy = capture.processingStatus === 'submitted' ? await processingWorkerHealthy() : true; send(response, 200, { sessionId: capture.id, status, stage: capture.processingStage ?? (status === 'completed' ? 'completed' : 'queued'), progress: capture.processingProgress ?? (status === 'completed' ? 100 : capture.mediaAssetId ? 5 : 0), message: status === 'completed' ? 'Procedure graph draft is ready.' : capture.processingStatus === 'submitted' ? !workerHealthy ? 'The recording is safely queued, but the processing worker is offline. Run pnpm golden-run:restart.' : capture.processingMessage ?? `Processing attempt ${capture.processingAttemptCount ?? 1} of 5 is running.` : capture.processingBlockReason ?? 'Temporal processing is blocked until a durable worker is configured.', heartbeatAt: capture.processingHeartbeatAt, workerHealthy, graphId: status === 'completed' ? workflow.graph?.id : undefined, workflowId: capture.processingWorkflowId, processingStatus: capture.processingStatus, attempt: capture.processingAttemptCount ?? 0, maxAttempts: 5, canRetry: status !== 'completed' && (capture.processingAttemptCount ?? 0) < 5 && capture.mediaAssetId !== undefined }, traceId); return; }
  if (parts[0] === 'capture-sessions' && parts[2] === 'processing' && parts[3] === 'retry' && parts.length === 4 && method === 'POST') {
    const capture = getCapture(parts[1]!, companyId); const asset = capture.mediaAssetId ? store.mediaAssets.get(capture.mediaAssetId) : undefined;
    if (!asset || asset.state !== 'available') throw new HttpError(412, 'PRECONDITION_FAILED', 'An available canonical MP4 is required before processing can be retried.');
    if ((capture.processingAttemptCount ?? 0) >= 5) throw new HttpError(409, 'CONFLICT', 'The five-attempt processing limit has been reached. The original recording is preserved.');
    if (asset.storageKind === 'local_import' && asset.localPath) {
      const storage = canonicalMediaClient();
      if (!storage) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'Canonical processing storage is not configured.');
      const sha256 = asset.sha256 ?? await sha256File(asset.localPath);
      await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: asset.objectKey, Body: createReadStream(asset.localPath), ContentType: asset.contentType ?? 'video/mp4', Metadata: { sha256 } }));
      const uploaded = await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: asset.objectKey }));
      if (uploaded.ContentLength !== asset.sizeBytes || uploaded.Metadata?.sha256 !== sha256) throw new HttpError(502, 'MEDIA_UPLOAD_FAILED', 'The preserved MP4 failed storage verification.');
      asset.sha256 = sha256;
    }
    capture.processingStatus = undefined; capture.processingBlockReason = undefined; capture.state = 'processing';
    await queueCaptureProcessing(capture, asset, companyId, true);
    event(companyId, 'capture.processing.retried', { processingStatus: capture.processingStatus, workflowId: capture.processingWorkflowId, attempt: capture.processingAttemptCount, maxAttempts: 5 }, capture.workflowId, capture.id);
    send(response, 202, captureView(capture), traceId); return;
  }
  if (parts[0] === 'workflows' && parts[2] === 'procedure-graph' && parts.length === 3 && method === 'GET') { const workflow = getWorkflow(parts[1]!, companyId); if (!workflow.graph) throw new HttpError(412, 'PRECONDITION_FAILED', 'A processed procedure graph is required before it can be reviewed.'); send(response, 200, workflow.graph, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'procedure-graph' && parts.length === 3 && method === 'PATCH') { const workflow = getWorkflow(parts[1]!, companyId); if (workflow.status === 'Published') throw new HttpError(409, 'CONFLICT', 'Published procedure versions are immutable. Create a new draft version before editing.'); const graph = ProcedureGraphSchema.safeParse(payload.graph); if (!graph.success) throw new HttpError(400, 'VALIDATION_FAILED', graph.error.message); const result = validateProcedureGraph({ ...graph.data, published: false }); if (!result.valid || !result.graph) throw new HttpError(400, 'VALIDATION_FAILED', result.issues.map((issue) => issue.path + ': ' + issue.message).join('; ')); workflow.graph = result.graph; workflow.status = 'Needs Review'; workflow.updatedAt = now(); event(companyId, 'procedure.draft.updated', { version: workflow.graph.version }, workflow.id); send(response, 200, workflow.graph, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'procedure-graph' && parts[3] === 'publish' && parts.length === 4 && method === 'POST') { const workflow = getWorkflow(parts[1]!, companyId); if (workflow.status === 'Published') throw new HttpError(409, 'CONFLICT', 'Published procedure versions are immutable.'); const reviewerNote = String(payload.reviewerNote ?? '').trim(); if (!reviewerNote) throw new HttpError(400, 'VALIDATION_FAILED', 'reviewerNote is required to publish a procedure.'); const candidate = (payload.graph as unknown) ?? workflow.graph; if (!candidate) throw new HttpError(412, 'PRECONDITION_FAILED', 'A processed procedure graph is required before publication.'); const parsed = ProcedureGraphSchema.safeParse(candidate); if (!parsed.success) throw new HttpError(400, 'VALIDATION_FAILED', parsed.error.message); let published: ProcedureGraph; try { published = publishProcedureGraph(parsed.data); } catch (error) { if (error instanceof GraphValidationError) throw new HttpError(400, 'VALIDATION_FAILED', error.message); throw error; } workflow.graph = published; workflow.status = 'Published'; workflow.updatedAt = now(); event(companyId, 'procedure.published', { version: workflow.graph.version, contentHash: workflow.graph.contentHash, reviewerNote }, workflow.id); send(response, 200, workflow.graph, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'annotations' && parts.length === 3 && method === 'GET') { const workflow = getWorkflow(parts[1]!, companyId); send(response, 200, annotationsForWorkflow(workflow.id, companyId), traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'annotations' && parts.length === 3 && method === 'POST') { const workflow = getWorkflow(parts[1]!, companyId); if (!workflow.graph) throw new HttpError(412, 'PRECONDITION_FAILED', 'A procedure graph is required before annotations can be reviewed.'); const annotationId = id(); const annotation = reviewedAnnotation(payload, { id: annotationId, companyId, workflowId: workflow.id, memberId, revision: 1, createdAt: now() }); if (!workflow.graph.steps.some((step) => step.id === annotation.stepId)) throw new HttpError(400, 'VALIDATION_FAILED', 'The annotation step does not belong to this procedure graph.'); const capture = getCapture(annotation.captureSessionId, companyId); if (capture.workflowId !== workflow.id) throw new HttpError(400, 'VALIDATION_FAILED', 'The annotation capture does not belong to this workflow.'); store.annotations.set(annotation.id, annotation); event(companyId, 'annotation.created', { annotationId: annotation.id, stepId: annotation.stepId, reviewStatus: annotation.reviewStatus, verdict: annotation.verdict }, workflow.id, annotation.captureSessionId); send(response, 201, annotation, traceId); return; }
  if (parts[0] === 'annotations' && parts.length === 2 && method === 'PATCH') { const existing = getAnnotation(parts[1]!, companyId); const workflow = getWorkflow(existing.workflowId, companyId); if (!workflow.graph?.steps.some((step) => step.id === String(payload.stepId ?? ''))) throw new HttpError(400, 'VALIDATION_FAILED', 'The annotation step does not belong to this procedure graph.'); const annotation = reviewedAnnotation(payload, { id: existing.id, companyId, workflowId: existing.workflowId, memberId, revision: existing.revision + 1, createdAt: existing.createdAt }); const capture = getCapture(annotation.captureSessionId, companyId); if (capture.workflowId !== workflow.id) throw new HttpError(400, 'VALIDATION_FAILED', 'The annotation capture does not belong to this workflow.'); store.annotations.set(annotation.id, annotation); event(companyId, 'annotation.updated', { annotationId: annotation.id, revision: annotation.revision, reviewStatus: annotation.reviewStatus, verdict: annotation.verdict }, workflow.id, annotation.captureSessionId); send(response, 200, annotation, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'reference-pack' && parts.length === 3 && method === 'GET') { const workflow = getWorkflow(parts[1]!, companyId); const pack = referencePacksForWorkflow(workflow.id, companyId)[0]; if (!pack) throw new HttpError(404, 'NOT_FOUND', 'No reference pack has been published for this workflow.'); send(response, 200, pack, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'reference-pack' && parts[3] === 'publish' && parts.length === 4 && method === 'POST') { const workflow = getWorkflow(parts[1]!, companyId); if (!workflow.graph?.published || workflow.status !== 'Published') throw new HttpError(412, 'PRECONDITION_FAILED', 'Publish the reviewed procedure before publishing its reference pack.'); const packs = referencePacksForWorkflow(workflow.id, companyId); let candidate; try { candidate = buildReferencePack({ id: id(), companyId, workflowId: workflow.id, version: (packs[0]?.version ?? 0) + 1, publishedAt: now(), publishedByMemberId: memberId }, workflow.graph, annotationsForWorkflow(workflow.id, companyId)); } catch (error) { throw new HttpError(412, 'PRECONDITION_FAILED', error instanceof Error ? error.message : 'The reference pack could not be built.'); } const latest = packs[0]; if (latest?.contentHash === candidate.contentHash && latest.procedureVersion === candidate.procedureVersion) { send(response, 200, latest, traceId); return; } store.referencePacks.set(candidate.id, candidate); event(companyId, 'reference_pack.published', { referencePackId: candidate.id, version: candidate.version, procedureVersion: candidate.procedureVersion, contentHash: candidate.contentHash, coverage: candidate.coverage, embeddingStatus: candidate.embeddingStatus }, workflow.id); send(response, 201, candidate, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'deployments' && parts.length === 3 && method === 'POST') { const workflow = getWorkflow(parts[1]!, companyId); if (workflow.status !== 'Published') throw new HttpError(412, 'PRECONDITION_FAILED', 'A published workflow is required before deployment.'); const run: DeploymentRun = { id: id(), workflowId: workflow.id, companyId, status: 'ready', currentStep: 0, deviations: [], paperState: { status: 'clear' }, voiceState: 'closed' }; store.deployments.set(run.id, run); event(companyId, 'deployment.created', { status: run.status }, workflow.id, undefined, run.id); send(response, 201, deploymentView(run), traceId); return; }
  if (parts[0] === 'deployments' && parts.length === 2 && method === 'GET') { const run = getDeployment(parts[1]!, companyId); send(response, 200, deploymentView(run), traceId); return; }
  if (parts[0] === 'deployments' && parts[2] === 'voice' && parts.length === 3 && method === 'POST') { const run = getDeployment(parts[1]!, companyId); const voiceEvent = parseVoiceEvent(payload); const previousVoiceState = run.voiceState ?? 'closed'; const result = reduceVoiceState(previousVoiceState, voiceEvent); if (!result.accepted) throw new HttpError(409, 'CONFLICT', result.error ?? 'Voice event was not accepted.'); run.voiceState = result.state; event(companyId, 'deployment.voice.state_changed', { previousState: previousVoiceState, nextState: result.state, eventType: voiceEvent.type }, run.workflowId, undefined, run.id); send(response, 200, deploymentView(run), traceId); return; }
  if (parts[0] === 'deployments' && parts[2] === 'observations' && parts.length === 3 && method === 'POST') { const run = getDeployment(parts[1]!, companyId); run.paperState ??= { status: 'clear' }; let result; try { result = evaluatePaperCraneObservation(run.paperState, payload); } catch (error) { throw new HttpError(400, 'VALIDATION_FAILED', error instanceof Error ? error.message : 'Invalid paper-crane observation.'); } run.paperState = result.state; if (result.decision.type === 'INTERRUPT') { run.status = 'active'; run.deviations.push({ id: id(), state: 'confirmed', severity: 'stop' }); run.intervention = { title: 'Wrong fold detected', detail: result.decision.reason, recoveryStepId: result.decision.recovery.id, confidence: 0.9, persistenceMs: PAPER_CRANE_POLICY.expected.persistenceMs }; event(companyId, 'deviation.interrupted', { decision: result.decision.type, reason: result.decision.reason }, run.workflowId, undefined, run.id); } send(response, 200, { ...deploymentView(run), decision: result.decision.type, decisionReason: result.decision.reason }, traceId); return; }
  if (parts[0] === 'deployments' && parts[2] === 'recovery' && parts.length === 3 && method === 'POST') { const run = getDeployment(parts[1]!, companyId); if (run.status !== 'active' || !run.intervention) throw new HttpError(409, 'CONFLICT', 'No approved recovery is currently required.'); run.status = 'completed'; run.currentStep += 1; run.deviations.push({ id: id(), state: 'resolved', severity: 'stop' }); run.intervention = undefined; run.paperState = { status: 'resolved' }; event(companyId, 'deviation.resolved', { recoveryStepId: String(payload.recoveryStepId ?? '') }, run.workflowId, undefined, run.id); send(response, 200, deploymentView(run), traceId); return; }
  if (parts[0] === 'events' && method === 'GET') { send(response, 200, store.events.filter((value) => value.companyId === companyId), traceId); return; }
  throw new HttpError(404, 'NOT_FOUND', 'Route was not found.');
}

const server = createServer(async (request, response) => {
  try {
    await store.ready;
    await route(request, response);
    await store.flush();
  } catch (error) {
    const status = error instanceof HttpError || error instanceof TenantContextError ? error.status : 500;
    const code = error instanceof HttpError || error instanceof TenantContextError ? error.code : 'INTERNAL_ERROR';
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    if (!response.headersSent) send(response, status, { error: { code, message, traceId: id() } });
    else console.error('Vision Codef request persistence failure', error);
  }
});
server.listen(port, () => console.log(`Vision Codef API listening on http://localhost:${port}`));
process.on('SIGTERM', () => { void store.close(); server.close(); });
