import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { EgressStatus, WebhookReceiver } from 'livekit-server-sdk';
import { randomInt } from 'node:crypto';
import { URL } from 'node:url';
import { generateUuidV7 } from '@vision-codef/database';
import { ProcessingCompletionSchema, ProcedureGraphSchema, VoiceEventSchema, WhyResponseSchema, WorkflowIntentSchema, type EventEnvelope, type ProcessingCompletion, type ProcedureGraph, type WorkflowIntent } from '@vision-codef/contracts';
import { DevelopmentStore, type CaptureSession, type DeploymentRun, type MediaAsset, type Workflow } from './store.js';
import { evaluatePaperCraneObservation, PAPER_CRANE_POLICY } from './paper-crane.js';
import { issueLiveKitToken } from './livekit-token.js';
import { canonicalObjectKey, getCanonicalEgressConfig, startCanonicalEgress, stopCanonicalEgress } from './livekit-egress.js';
import { getProcessingMetadata, startCaptureProcessing } from './processing-client.js';
import { verifyProcessingCompletionSignature } from './processing-webhook.js';
import { createMembershipDirectory } from './membership.js';
import { createConfiguredRuntimePersistence } from './runtime-persistence.js';
import { authenticateRequest } from './auth.js';
import { parseTenantContext, TenantContextError } from './tenant-context.js';
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
function deploymentView(run: DeploymentRun) { const workflow = getWorkflow(run.workflowId, run.companyId); const graph = workflow.graph; const step = graph?.steps[run.currentStep]; const why = graph && step ? WhyResponseSchema.parse({ text: `This instruction is taken from approved procedure version ${graph.version}.`, evidenceIds: step.evidenceRefs, procedureVersion: graph.version, provenance: step.provenance }) : undefined; return { ...run, status: run.status === 'active' ? 'monitoring' : run.status, totalSteps: graph?.steps.length ?? 0, currentInstruction: step?.instruction, intervention: run.intervention, why }; }

function classify(text: string): WorkflowIntent {
  const value = text.toLowerCase();
  const goldenCues = ['teach', 'procedure', 'maintenance', 'training', 'steps', 'repair', 'assembly', 'inspection', 'demonstration', 'how to'];
  const cameraCues = ['detect', 'alert', 'camera', 'premises', 'after hours', 'zone', 'person', 'vehicle', 'notify', 'cctv', 'event'];
  const goldenHits = goldenCues.filter((cue) => value.includes(cue)).length;
  const cameraHits = cameraCues.filter((cue) => value.includes(cue)).length;
  const family = goldenHits === cameraHits ? 'ambiguous' : goldenHits > cameraHits ? 'golden_run' : 'camera_automation';
  const confidence = family === 'ambiguous' ? 0.5 : Math.min(0.98, 0.55 + Math.abs(goldenHits - cameraHits) / Math.max(goldenHits + cameraHits, 1) * 0.4);
  return WorkflowIntentSchema.parse({ family, confidence, rationale: family === 'ambiguous' ? 'The request needs one workflow-family choice.' : `Matched ${family === 'golden_run' ? goldenHits : cameraHits} workflow cue(s).`, extractedGoal: text.trim(), mentionedDevices: [], mentionedConditions: [], mentionedActions: [], missingCriticalFields: family === 'ambiguous' ? ['workflow family'] : [] });
}

function parseVoiceEvent(payload: Record<string, unknown>): VoiceEvent {
  const result = VoiceEventSchema.safeParse(payload);
  if (!result.success) throw new HttpError(400, 'VALIDATION_FAILED', 'Unsupported or incomplete voice event.');
  return result.data;
}
function graphFor(workflowId: string): ProcedureGraph {
  const start = id(); const folded = id(); const complete = id(); const first = id(); const second = id();
  return { id: workflowId, version: 1, published: false, states: [{ id: start, label: 'Flat and aligned', predicates: ['four corners visible', 'bottom edge aligned'] }, { id: folded, label: 'Triangle fold', predicates: ['top corner meets bottom corner'] }, { id: complete, label: 'Complete', predicates: ['center crease is flat'] }], steps: [{ id: first, ordinalHint: 0, title: 'Set the paper square', instruction: 'Place the paper with the white side up and align the bottom edge with the mat.', observedAction: 'Paper boundary and four corners are visible.', evidenceRefs: [], provenance: ['EXPERT_ASSERTION', 'PUBLISHED_REQUIREMENT'], startState: [start], expectedAction: ['place paper', 'align bottom edge', '*'], endState: [folded], allowableVariations: ['Small rotation under 5 degrees'], deviationRules: ['Request better visibility if fewer than four corners are visible.'], recoveryTransitions: [], confidence: 0.98 }, { id: second, ordinalHint: 1, title: 'Fold the top corner down', instruction: 'Bring the top corner down to meet the bottom corner, then crease firmly.', observedAction: 'Top corner moves toward the bottom corner.', evidenceRefs: [], provenance: ['EXPERT_ASSERTION', 'SENSOR_OBSERVATION', 'PUBLISHED_REQUIREMENT'], startState: [folded], expectedAction: ['fold top corner', 'crease', '*'], endState: [complete], allowableVariations: ['Corner alignment within configured tolerance'], deviationRules: ['Interrupt if the wrong corner moves toward the bottom edge.'], recoveryTransitions: [first], confidence: 0.91 }], contentHash: undefined };
}

async function readBody(request: IncomingMessage): Promise<string> { let raw = ''; for await (const chunk of request) raw += chunk; return raw; }
async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> { const raw = await readBody(request); if (!raw) return {}; try { return JSON.parse(raw) as Record<string, unknown>; } catch { throw new HttpError(400, 'VALIDATION_FAILED', 'Request body must be valid JSON.'); } }
class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
function send(response: ServerResponse, status: number, data: unknown, traceId = id()) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-company-id, x-member-id, idempotency-key' }); response.end(JSON.stringify({ data, traceId, schemaVersion: '0.1' })); }
function event(companyId: string, eventType: string, payload: Record<string, unknown>, workflowId?: string, sessionId?: string, runId?: string) { const value: EventEnvelope = { eventId: id(), schemaVersion: '0.1', companyId, workflowId, sessionId, runId, source: 'api', occurredAt: now(), traceId: id(), eventType, payload }; store.events.push(value); return value; }
function getWorkflow(value: string, expectedCompanyId: string) { const workflow = store.workflows.get(value); if (!workflow || workflow.companyId !== expectedCompanyId) throw new HttpError(404, 'NOT_FOUND', 'Workflow was not found.'); return workflow; }
function getCapture(value: string, expectedCompanyId: string) { const capture = store.captures.get(value); if (!capture || capture.companyId !== expectedCompanyId) throw new HttpError(404, 'NOT_FOUND', 'Capture session was not found.'); return capture; }
function getMediaAsset(value: string, expectedCompanyId: string) { const asset = store.mediaAssets.get(value); if (!asset || asset.companyId !== expectedCompanyId) throw new HttpError(404, 'NOT_FOUND', 'Media asset was not found.'); return asset; }
function getDeployment(value: string, expectedCompanyId: string) { const run = store.deployments.get(value); if (!run || run.companyId !== expectedCompanyId) throw new HttpError(404, 'NOT_FOUND', 'Deployment run was not found.'); return run; }

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

async function queueCaptureProcessing(capture: CaptureSession, asset: MediaAsset | undefined, companyId: string): Promise<void> {
  if (capture.processingStatus === 'submitted' || capture.processingStatus === 'completed') return;
  const workflow = getWorkflow(capture.workflowId, companyId);
  capture.state = 'processing';
  workflow.status = 'Processing';
  workflow.updatedAt = now();
  if (!asset?.egressId) {
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
  try {
    const handle = await startCaptureProcessing({
      companyId,
      workflowId: capture.workflowId,
      captureSessionId: capture.id,
      media: { companyId, objectKey: asset.objectKey },
      metadata,
      idempotencyKey: 'capture.finalize:' + capture.id,
    });
    capture.processingWorkflowId = handle?.workflowId;
    capture.processingRunId = handle?.runId;
    capture.processingStatus = handle ? 'submitted' : 'blocked';
    capture.processingBlockReason = handle ? undefined : 'Temporal processing is not configured.';
  } catch (error) {
    capture.state = 'failed';
    workflow.status = 'Processing Failed';
    asset.state = 'failed';
    capture.processingStatus = 'failed';
    capture.processingBlockReason = error instanceof Error ? error.message : 'Temporal workflow submission failed.';
    event(companyId, 'capture.processing.failed', { state: capture.state, reason: capture.processingBlockReason }, capture.workflowId, capture.id);
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
  if (path === '/v1/internal/processing-completions' && method === 'POST') { const raw = await readBody(request); const secret = process.env.VISION_CODEF_PROCESSING_WEBHOOK_SECRET; if (!secret) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'Processing completion verification is not configured.'); const signature = request.headers['x-vision-codef-signature']; if (Array.isArray(signature) || !verifyProcessingCompletionSignature(raw, signature, secret)) throw new HttpError(401, 'UNAUTHENTICATED', 'Processing completion signature verification failed.'); let input: ProcessingCompletion; try { input = ProcessingCompletionSchema.parse(JSON.parse(raw)); } catch (error) { throw new HttpError(400, 'VALIDATION_FAILED', error instanceof Error ? error.message : 'Processing completion payload is invalid.'); } const result = applyProcessingCompletion(input); send(response, 200, { accepted: true, duplicate: result.duplicate, captureSessionId: result.capture.id, workflowId: result.workflow.id, processingStatus: result.capture.processingStatus }, traceId); return; }
  if (path === '/v1/webhooks/livekit' && method === 'POST') { const raw = await readBody(request); const apiKey = process.env.LIVEKIT_WEBHOOK_API_KEY ?? process.env.LIVEKIT_API_KEY; const apiSecret = process.env.LIVEKIT_WEBHOOK_API_SECRET ?? process.env.LIVEKIT_API_SECRET; if (!apiKey || !apiSecret) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'LiveKit webhook verification is not configured.'); let webhook; try { webhook = await new WebhookReceiver(apiKey, apiSecret).receive(raw, request.headers.authorization); } catch (error) { throw new HttpError(401, 'UNAUTHENTICATED', error instanceof Error ? error.message : 'LiveKit webhook verification failed.'); } if (webhook.event !== 'egress_ended' || !webhook.egressInfo) { send(response, 200, { received: true, handled: false, event: webhook.event }, traceId); return; } const info = webhook.egressInfo; const asset = [...store.mediaAssets.values()].find((value) => value.egressId === info.egressId); if (!asset) { send(response, 202, { received: true, handled: false, reason: 'No matching media asset.' }, traceId); return; } const capture = getCapture(asset.captureSessionId, asset.companyId); if (info.status === EgressStatus.EGRESS_COMPLETE && !info.error) { asset.state = 'available'; await queueCaptureProcessing(capture, asset, asset.companyId); } else { asset.state = 'failed'; capture.state = 'failed'; capture.processingStatus = 'failed'; capture.processingBlockReason = info.error || 'LiveKit Egress ended without a complete media object.'; getWorkflow(capture.workflowId, asset.companyId).status = 'Processing Failed'; } event(asset.companyId, 'capture.egress.ended', { egressId: info.egressId, status: info.status, mediaAssetState: asset.state, processingStatus: capture.processingStatus }, capture.workflowId, capture.id); send(response, 200, { received: true, handled: true, egressId: info.egressId, mediaAsset: asset, processingStatus: capture.processingStatus }, traceId); return; }
  const headerTenant = parseTenantContext(request.headers); let tenant; try { tenant = authenticateRequest(request.headers, headerTenant); } catch (error) { throw new HttpError(401, 'UNAUTHENTICATED', error instanceof Error ? error.message : 'Request authentication failed.'); } const { companyId, memberId } = tenant; if (!membershipDirectory.has(tenant)) throw new HttpError(403, 'FORBIDDEN', 'The authenticated member is not a member of this company.');
  const parts = path.split('/').filter(Boolean).slice(1); const payload = ['POST', 'PATCH', 'PUT'].includes(method) ? await readJson(request) : {};
  if (parts[0] === 'capture-token' && parts.length === 1 && method === 'POST') { const sessionId = String(payload.sessionId ?? ''); const workflowId = String(payload.workflowId ?? ''); const deviceId = String(payload.deviceId ?? ''); const capture = getCapture(sessionId, companyId); if (workflowId !== capture.workflowId) throw new HttpError(403, 'FORBIDDEN_TENANT', 'The capture session does not belong to the requested workflow.'); if (String(payload.memberId ?? '') !== memberId) throw new HttpError(403, 'FORBIDDEN_TENANT', 'The token member must match the authenticated request member.'); if (!capture.pairedDeviceId || !deviceId || deviceId !== capture.pairedDeviceId) throw new HttpError(403, 'FORBIDDEN_TENANT', 'The phone must claim this capture session before a publisher token is issued.'); if (!liveKitConfigured) throw new HttpError(503, 'EXTERNAL_PROVIDER_UNAVAILABLE', 'LiveKit credentials are not configured.'); const issued = await issueLiveKitToken({ companyId, memberId, workflowId: capture.workflowId, sessionId: capture.id, role: 'publisher' }); send(response, 200, issued, traceId); return; }
  if (parts[0] === 'workflows' && parts[1] === 'intent' && method === 'POST') { send(response, 200, classify(String(payload.brief ?? payload.text ?? '')), traceId); return; }
  if (parts[0] === 'workflows' && parts.length === 1 && method === 'GET') { send(response, 200, [...store.workflows.values()].filter((value) => value.companyId === companyId), traceId); return; }
  if (parts[0] === 'workflows' && parts.length === 1 && method === 'POST') { const objective = String(payload.brief ?? payload.objective ?? payload.message ?? '').trim(); if (!objective) throw new HttpError(400, 'VALIDATION_FAILED', 'brief is required.'); const intent = classify(objective); if (intent.family === 'ambiguous') { send(response, 200, { intent, requiresClarification: true }, traceId); return; } const workflow: Workflow = { id: id(), companyId, title: objective.slice(0, 72), family: intent.family, objective, status: 'Draft', createdAt: now(), updatedAt: now() }; store.workflows.set(workflow.id, workflow); event(companyId, 'workflow.created', { intent }, workflow.id); send(response, 201, { ...workflow, intent, stage: 'train', description: objective }, traceId); return; }
  if (parts[0] === 'workflows' && parts.length === 2 && method === 'GET') { const workflow = getWorkflow(parts[1]!, companyId); send(response, 200, { ...workflow, stage: workflow.status === 'Published' ? 'deploy' : 'train', description: workflow.objective }, traceId); return; }
  if (parts[0] === 'capture-pairings' && parts[1] === 'claim' && parts.length === 2 && method === 'POST') { const pairingCode = String(payload.pairingCode ?? '').trim(); const deviceId = String(payload.deviceId ?? '').trim(); if (!/^\d{6}$/.test(pairingCode) || !deviceId) throw new HttpError(400, 'VALIDATION_FAILED', 'A six-digit pairingCode and deviceId are required.'); const capture = [...store.captures.values()].find((value) => value.companyId === companyId && value.pairingCode === pairingCode); if (!capture || Date.parse(capture.pairingExpiresAt) <= Date.now()) throw new HttpError(401, 'UNAUTHENTICATED', 'The pairing code is invalid or expired.'); if (capture.pairedDeviceId && capture.pairedDeviceId !== deviceId) throw new HttpError(409, 'CONFLICT', 'This capture session is already paired to another device.'); capture.pairedDeviceId = deviceId; capture.pairedAt ??= now(); event(companyId, 'capture.paired', { deviceId }, capture.workflowId, capture.id); send(response, 200, { sessionId: capture.id, workflowId: capture.workflowId, deviceId, roomName: `company-${companyId}-workflow-${capture.workflowId}` }, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'capture-sessions' && parts.length === 3 && method === 'POST') { const workflow = getWorkflow(parts[1]!, companyId); if (workflow.family !== 'golden_run') throw new HttpError(409, 'CONFLICT', 'Only Golden Run workflows can capture.'); const capture: CaptureSession = { id: id(), workflowId: workflow.id, companyId, state: 'preparing', pairingCode: String(randomInt(100000, 1000000)), pairingExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }; store.captures.set(capture.id, capture); event(companyId, 'capture.created', { state: capture.state }, workflow.id, capture.id); send(response, 201, { ...capture, connectionStatus: 'disconnected', roomName: `company-${companyId}-workflow-${workflow.id}` }, traceId); return; }
  if (parts[0] === 'capture-sessions' && parts.length === 2 && method === 'GET') { const capture = getCapture(parts[1]!, companyId); send(response, 200, { ...capture, connectionStatus: capture.state === 'active' ? 'connecting' : 'disconnected' }, traceId); return; }
  if (parts[0] === 'capture-sessions' && parts[2] === 'start' && parts.length === 3 && method === 'POST') { const capture = getCapture(parts[1]!, companyId); const existingAsset = capture.mediaAssetId ? store.mediaAssets.get(capture.mediaAssetId) : undefined; if (capture.state === 'active' && existingAsset) { send(response, 200, { ...capture, connectionStatus: 'connecting', roomName: 'company-' + companyId + '-workflow-' + capture.workflowId, mediaAsset: existingAsset, egressStatus: existingAsset.egressId ? 'recording' : 'blocked' }, traceId); return; } if (capture.state !== 'preparing') throw new HttpError(409, 'CONFLICT', 'The capture session is not ready to start.'); if (!capture.pairedDeviceId) throw new HttpError(409, 'CONFLICT', 'Claim the capture session from the native phone before starting capture.'); const workflow = getWorkflow(capture.workflowId, companyId); const objectKey = canonicalObjectKey(companyId, capture.id); const asset: MediaAsset = { id: id(), companyId, captureSessionId: capture.id, state: 'pending', objectKey }; if (getCanonicalEgressConfig()) { try { const egress = await startCanonicalEgress({ companyId, workflowId: capture.workflowId, sessionId: capture.id }); capture.egressId = egress.egressId; asset.egressId = egress.egressId; asset.state = 'uploading'; } catch (error) { throw new HttpError(502, 'EXTERNAL_PROVIDER_UNAVAILABLE', error instanceof Error ? error.message : 'Canonical LiveKit Egress could not start.'); } } store.mediaAssets.set(asset.id, asset); capture.mediaAssetId = asset.id; capture.state = 'active'; capture.startedAt ??= now(); workflow.status = 'Capturing'; workflow.updatedAt = now(); event(companyId, 'capture.started', { state: capture.state, egressStatus: asset.egressId ? 'recording' : 'blocked' }, capture.workflowId, capture.id); send(response, 200, { ...capture, connectionStatus: 'connecting', roomName: 'company-' + companyId + '-workflow-' + capture.workflowId, mediaAsset: asset, egressStatus: asset.egressId ? 'recording' : 'blocked' }, traceId); return; }
  if (parts[0] === 'capture-sessions' && parts[2] === 'stop' && parts.length === 3 && method === 'POST') { const capture = getCapture(parts[1]!, companyId); const existingAsset = capture.mediaAssetId ? store.mediaAssets.get(capture.mediaAssetId) : undefined; if (capture.state === 'finalizing' || capture.state === 'processing' || capture.state === 'completed') { send(response, 200, { ...capture, connectionStatus: 'disconnected', mediaAsset: existingAsset, egressStatus: existingAsset?.state === 'available' ? 'available' : capture.egressId ? 'stopped_waiting_for_object' : 'blocked' }, traceId); return; } if (capture.state !== 'active' && capture.state !== 'paused') throw new HttpError(409, 'CONFLICT', 'The capture session is not active.'); if (capture.egressId) { try { await stopCanonicalEgress(capture.egressId); } catch (error) { throw new HttpError(502, 'EXTERNAL_PROVIDER_UNAVAILABLE', error instanceof Error ? error.message : 'Canonical LiveKit Egress could not stop.'); } } const workflow = getWorkflow(capture.workflowId, companyId); capture.state = capture.egressId ? 'finalizing' : 'processing'; capture.endedAt = now(); workflow.status = 'Processing'; workflow.updatedAt = now(); const asset = capture.mediaAssetId ? store.mediaAssets.get(capture.mediaAssetId) : undefined; if (asset) asset.state = 'pending'; if (!capture.egressId) await queueCaptureProcessing(capture, asset, companyId); event(companyId, 'capture.ended', { state: capture.state, egressStatus: capture.egressId ? 'stopped_waiting_for_object' : 'blocked', processingStatus: capture.processingStatus }, capture.workflowId, capture.id); send(response, 200, { ...capture, connectionStatus: 'disconnected', mediaAsset: asset, egressStatus: capture.egressId ? 'stopped_waiting_for_object' : 'blocked' }, traceId); return; }
  if (parts[0] === 'capture-sessions' && parts[2] === 'monitor' && parts.length === 3 && method === 'GET') { const capture = getCapture(parts[1]!, companyId); send(response, 200, await monitorView(capture, companyId, memberId), traceId); return; }
  if (parts[0] === 'media-assets' && parts.length === 2 && method === 'GET') { send(response, 200, getMediaAsset(parts[1]!, companyId), traceId); return; }
  if (parts[0] === 'capture-sessions' && parts[2] === 'processing' && parts.length === 3 && method === 'GET') { const capture = getCapture(parts[1]!, companyId); const done = capture.state === 'completed'; send(response, 200, { sessionId: capture.id, status: done ? 'completed' : 'queued', progress: done ? 100 : 10, message: done ? 'Procedure graph draft is ready.' : capture.processingStatus === 'submitted' ? 'Temporal processing workflow is running.' : capture.processingBlockReason ?? 'Temporal processing is blocked until a durable worker is configured.', graphId: done ? getWorkflow(capture.workflowId, companyId).graph?.id : undefined, workflowId: capture.processingWorkflowId, processingStatus: capture.processingStatus }, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'procedure-graph' && parts.length === 3 && method === 'GET') { const workflow = getWorkflow(parts[1]!, companyId); workflow.graph ??= graphFor(workflow.id); send(response, 200, workflow.graph, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'procedure-graph' && parts.length === 3 && method === 'PATCH') { const workflow = getWorkflow(parts[1]!, companyId); if (workflow.status === 'Published') throw new HttpError(409, 'CONFLICT', 'Published procedure versions are immutable. Create a new draft version before editing.'); const graph = ProcedureGraphSchema.safeParse(payload.graph); if (!graph.success) throw new HttpError(400, 'VALIDATION_FAILED', graph.error.message); const result = validateProcedureGraph({ ...graph.data, published: false }); if (!result.valid || !result.graph) throw new HttpError(400, 'VALIDATION_FAILED', result.issues.map((issue) => issue.path + ': ' + issue.message).join('; ')); workflow.graph = result.graph; workflow.status = 'Needs Review'; workflow.updatedAt = now(); event(companyId, 'procedure.draft.updated', { version: workflow.graph.version }, workflow.id); send(response, 200, workflow.graph, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'procedure-graph' && parts[3] === 'publish' && parts.length === 4 && method === 'POST') { const workflow = getWorkflow(parts[1]!, companyId); if (workflow.status === 'Published') throw new HttpError(409, 'CONFLICT', 'Published procedure versions are immutable.'); const reviewerNote = String(payload.reviewerNote ?? '').trim(); if (!reviewerNote) throw new HttpError(400, 'VALIDATION_FAILED', 'reviewerNote is required to publish a procedure.'); const parsed = ProcedureGraphSchema.safeParse((payload.graph as unknown) ?? workflow.graph ?? graphFor(workflow.id)); if (!parsed.success) throw new HttpError(400, 'VALIDATION_FAILED', parsed.error.message); let published: ProcedureGraph; try { published = publishProcedureGraph(parsed.data); } catch (error) { if (error instanceof GraphValidationError) throw new HttpError(400, 'VALIDATION_FAILED', error.message); throw error; } workflow.graph = published; workflow.status = 'Published'; workflow.updatedAt = now(); event(companyId, 'procedure.published', { version: workflow.graph.version, contentHash: workflow.graph.contentHash, reviewerNote }, workflow.id); send(response, 200, workflow.graph, traceId); return; }
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