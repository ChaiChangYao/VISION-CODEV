const baseUrl = (process.env.VISION_CODEF_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const tenantHeaders = { 'x-company-id': process.env.VISION_CODEF_COMPANY_ID ?? '00000000-0000-7000-8000-000000000001', 'x-member-id': process.env.VISION_CODEF_MEMBER_ID ?? '00000000-0000-4000-8000-000000000002' };

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...tenantHeaders, ...(options.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body?.data?.error?.message ?? body?.error?.message ?? 'request failed'}`);
  return body.data;
}

const workflow = await request('/v1/workflows', {
  method: 'POST',
  body: JSON.stringify({ brief: 'Teach me a maintenance procedure for folding a paper crane' }),
});
const graph = await request(`/v1/workflows/${workflow.id}/procedure-graph`);
await request(`/v1/workflows/${workflow.id}/procedure-graph/publish`, {
  method: 'POST',
  body: JSON.stringify({ graph }),
});
const deployment = await request(`/v1/workflows/${workflow.id}/deployments`, { method: 'POST' });
const corners = [{ x: 0, y: 0 }, { x: 100, y: 2 }, { x: 98, y: 100 }, { x: 2, y: 98 }];
const observation = (timestampMs) => ({ timestampMs, corners, foldState: 'diagonal-left', visibilityScore: 0.95, alignmentScore: 0.95, handOccluded: false });
const first = await request(`/v1/deployments/${deployment.id}/observations`, { method: 'POST', body: JSON.stringify(observation(0)) });
const second = await request(`/v1/deployments/${deployment.id}/observations`, { method: 'POST', body: JSON.stringify(observation(800)) });
if (first.decision !== 'WAIT' || second.decision !== 'INTERRUPT' || !second.intervention) throw new Error('paper-crane persistence gate did not interrupt as expected');
const completed = await request(`/v1/deployments/${deployment.id}/recovery`, { method: 'POST', body: JSON.stringify({ recoveryStepId: second.intervention.recoveryStepId }) });
if (completed.status !== 'completed') throw new Error('approved recovery did not complete the run');
console.log(JSON.stringify({ workflowId: workflow.id, deploymentId: deployment.id, firstDecision: first.decision, secondDecision: second.decision, finalStatus: completed.status }));

