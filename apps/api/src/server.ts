import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { WorkflowIntentSchema, type EventEnvelope, type WorkflowIntent } from '@vision-codef/contracts';
import { DevelopmentStore, type CaptureSession, type DeploymentRun, type Workflow } from './store.js';

const port = Number(process.env.PORT ?? 4000); const store = new DevelopmentStore();
const demoCompanyId = process.env.DEMO_COMPANY_ID ?? '00000000-0000-7000-8000-000000000001';
const now = () => new Date().toISOString(); const id = () => randomUUID();

function classify(text: string): WorkflowIntent {
  const normalized = text.toLowerCase();
  const golden = ['teach', 'procedure', 'maintenance', 'training', 'steps', 'repair', 'assembly', 'inspection', 'demonstration', 'how to'];
  const camera = ['detect', 'alert', 'camera', 'premises', 'after hours', 'zone', 'person', 'vehicle', 'notify', 'cctv', 'event'];
  const g = golden.filter((cue) => normalized.includes(cue)).length; const c = camera.filter((cue) => normalized.includes(cue)).length;
  const family = g === c ? 'ambiguous' : g > c ? 'golden_run' : 'camera_automation'; const total = Math.max(g + c, 1);
  return WorkflowIntentSchema.parse({ family, confidence: family === 'ambiguous' ? 0.5 : Math.min(0.98, 0.55 + Math.abs(g - c) / total * 0.4), rationale: family === 'ambiguous' ? 'The request does not contain a decisive workflow-family signal.' : `Matched ${family === 'golden_run' ? g : c} workflow cue(s).`, extractedGoal: text.trim(), mentionedDevices: [], mentionedConditions: [], mentionedActions: [], missingCriticalFields: family === 'ambiguous' ? ['workflow family'] : [] });
}
async function jsonBody(request: IncomingMessage): Promise<Record<string, unknown>> { let raw = ''; for await (const chunk of request) raw += chunk; if (!raw) return {}; try { return JSON.parse(raw) as Record<string, unknown>; } catch { throw new HttpError(400, 'VALIDATION_FAILED', 'Request body must be valid JSON.'); } }
class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
function send(response: ServerResponse, status: number, data: unknown, traceId = id()) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, idempotency-key' }); response.end(JSON.stringify({ data, traceId, schemaVersion: '0.1' })); }
function emit(companyId: string, eventType: string, payload: Record<string, unknown>, workflowId?: string, sessionId?: string, runId?: string) { const event: EventEnvelope = { eventId: id(), schemaVersion: '0.1', companyId, workflowId, sessionId, runId, source: 'api', occurredAt: now(), traceId: id(), eventType, payload }; store.events.push(event); return event; }
function workflow(workflowId: string) { const value = store.workflows.get(workflowId); if (!value) throw new HttpError(404, 'NOT_FOUND', 'Workflow was not found.'); return value; }
function capture(captureId: string) { const value = store.captures.get(captureId); if (!value) throw new HttpError(404, 'NOT_FOUND', 'Capture session was not found.'); return value; }
function deployment(runId: string) { const value = store.deployments.get(runId); if (!value) throw new HttpError(404, 'NOT_FOUND', 'Deployment run was not found.'); return value; }

async function route(request: IncomingMessage, response: ServerResponse) {
  const traceId = id(); const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`); const method = request.method ?? 'GET';
  if (method === 'OPTIONS') { response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'content-type, authorization, idempotency-key' }); response.end(); return; }
  if (url.pathname === '/health' && method === 'GET') { send(response, 200, { status: 'ok', service: 'api', time: now() }, traceId); return; }
  if (!url.pathname.startsWith('/api/v1/')) throw new HttpError(404, 'NOT_FOUND', 'Route was not found.');
  const parts = url.pathname.split('/').filter(Boolean).slice(2); const payload = ['POST', 'PUT', 'PATCH'].includes(method) ? await jsonBody(request) : {};
  if (parts[0] === 'intents' && method === 'POST') { send(response, 200, classify(String(payload.text ?? '')), traceId); return; }
  if (parts[0] === 'workflows' && parts.length === 1 && method === 'POST') { const objective = String(payload.objective ?? payload.message ?? '').trim(); if (!objective) throw new HttpError(400, 'VALIDATION_FAILED', 'objective is required.'); const intent = classify(objective); if (intent.family === 'ambiguous') { send(response, 200, { intent, requiresClarification: true }, traceId); return; } const item: Workflow = { id: id(), companyId: demoCompanyId, title: objective.slice(0, 72), family: intent.family, objective, status: 'Draft', createdAt: now(), updatedAt: now() }; store.workflows.set(item.id, item); emit(item.companyId, 'workflow.created', { intent }, item.id); send(response, 201, { workflow: item, intent }, traceId); return; }
  if (parts[0] === 'workflows' && parts.length === 2 && method === 'GET') { send(response, 200, workflow(parts[1]!), traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'captures' && parts.length === 3 && method === 'POST') { const item = workflow(parts[1]!); if (item.family !== 'golden_run') throw new HttpError(409, 'CONFLICT', 'Only Golden Run workflows can capture demonstrations.'); const value: CaptureSession = { id: id(), workflowId: item.id, companyId: item.companyId, state: 'preparing' }; store.captures.set(value.id, value); emit(value.companyId, 'capture.created', { state: value.state }, item.id, value.id); send(response, 201, value, traceId); return; }
  if (parts[0] === 'captures' && parts.length === 3 && parts[2] === 'transition' && method === 'POST') { const value = capture(parts[1]!); const next = String(payload.state ?? ''); const allowed: Record<string, string[]> = { preparing: ['active'], active: ['paused', 'finalizing'], paused: ['active', 'finalizing'], finalizing: ['processing'], processing: ['completed', 'failed'] }; if (!allowed[value.state]?.includes(next)) throw new HttpError(409, 'CONFLICT', `Cannot move capture from ${value.state} to ${next}.`); value.state = next as CaptureSession['state']; if (next === 'active') value.startedAt ??= now(); if (next === 'finalizing') value.endedAt = now(); emit(value.companyId, `capture.${next}`, { state: next }, value.workflowId, value.id); send(response, 200, value, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'publish' && parts.length === 3 && method === 'POST') { const item = workflow(parts[1]!); if (!item.graph) throw new HttpError(412, 'PRECONDITION_FAILED', 'A validated procedure graph is required before publication.'); item.status = 'Published'; item.updatedAt = now(); emit(item.companyId, 'procedure.published', { contentHash: item.graph.contentHash }, item.id); send(response, 200, item, traceId); return; }
  if (parts[0] === 'workflows' && parts[2] === 'deployment' && parts.length === 3 && method === 'POST') { const item = workflow(parts[1]!); if (item.status !== 'Published') throw new HttpError(412, 'PRECONDITION_FAILED', 'A published workflow is required before deployment.'); const value: DeploymentRun = { id: id(), workflowId: item.id, companyId: item.companyId, status: 'ready', currentStep: 0, deviations: [] }; store.deployments.set(value.id, value); emit(value.companyId, 'deployment.created', { status: value.status }, item.id, undefined, value.id); send(response, 201, value, traceId); return; }
  if (parts[0] === 'deployments' && parts.length === 2 && method === 'GET') { send(response, 200, deployment(parts[1]!), traceId); return; }
  if (parts[0] === 'events' && method === 'GET') { send(response, 200, store.events.filter((event) => event.companyId === demoCompanyId), traceId); return; }
  throw new HttpError(404, 'NOT_FOUND', 'Route was not found.');
}
const server = createServer(async (request, response) => { try { await route(request, response); } catch (error) { const status = error instanceof HttpError ? error.status : 500; const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR'; const message = error instanceof Error ? error.message : 'Unexpected server error.'; send(response, status, { error: { code, message, traceId: id() } }); } });
server.listen(port, () => console.log(`Vision Codef API listening on http://localhost:${port}`)); process.on('SIGTERM', () => server.close());

