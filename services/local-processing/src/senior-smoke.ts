import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { atomicWrite } from './atomic-analysis.js';
const root = resolve('../..');
config({ path: join(root, '.env'), quiet: true });
const headers = {
  'x-company-id': process.env.NEXT_PUBLIC_COMPANY_ID ?? '00000000-0000-7000-8000-000000000001',
  'x-member-id': process.env.NEXT_PUBLIC_MEMBER_ID ?? '00000000-0000-4000-8000-000000000002',
};
async function call(path: string, body?: unknown, method = 'POST') {
  const response = await fetch(`http://127.0.0.1:4000/v1${path}`, {
    method: body === undefined && method === 'POST' ? 'GET' : method,
    headers: { ...headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json()) as any;
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result.data;
}
const workflow = await call('/workflows', {
  brief: 'Senior pipeline verification — automotive source (test draft, not approved)',
  family: 'golden_run',
});
const media = await readFile(
  resolve(root, '../Research/Vision Lab Samples/automotive-source-with-silent-audio.mp4'),
);
const response = await fetch(
  `http://127.0.0.1:4000/v1/workflows/${workflow.id}/capture-sessions/import?filename=senior-verification-automotive.mp4&durationMs=15170`,
  { method: 'POST', headers: { ...headers, 'content-type': 'video/mp4' }, body: media },
);
const imported = (await response.json()) as any;
if (!response.ok) throw new Error(JSON.stringify(imported));
await atomicWrite(join(root, '.run/senior-evaluation/smoke.json'), {
  workflowId: workflow.id,
  captureId: imported.data.id,
});
console.log(`Test workflow ${workflow.id}, capture ${imported.data.id}`);
const started = Date.now();
let completed = false;
while (Date.now() - started < 15 * 60_000) {
  const status = await call(`/capture-sessions/${imported.data.id}/processing`);
  console.log(`${status.progress}% ${status.message}`);
  if (status.status === 'failed' || status.status === 'blocked')
    throw new Error('Smoke processing failed.');
  if (status.status === 'completed') {
    const graph = await call(`/workflows/${workflow.id}/procedure-graph`);
    if (
      !graph.analysis ||
      !graph.steps.length ||
      graph.steps.some((step: any) => step.seniorReview.reviewed)
    )
      throw new Error('Missing detailed unapproved draft.');
    const capture = await call(`/capture-sessions/${imported.data.id}`);
    const video = await fetch(
      `http://127.0.0.1:4000/v1/media-assets/${capture.mediaAsset.id}/content`,
      { headers },
    );
    if (!video.ok || (await video.arrayBuffer()).byteLength !== media.byteLength)
      throw new Error('Canonical playback bytes did not match import.');
    const originalInstruction = graph.steps[0].instruction;
    graph.steps[0].instruction = `${originalInstruction} [Draft persistence test]`;
    const saved = await call(`/workflows/${workflow.id}/procedure-graph`, { graph }, 'PATCH');
    if (saved.steps.length !== graph.steps.length) throw new Error('Draft round trip failed.');
    const reloaded = await call(`/workflows/${workflow.id}/procedure-graph`);
    if (reloaded.steps[0].instruction !== graph.steps[0].instruction) throw new Error('Edited instruction did not persist.');
    graph.steps[0].instruction = originalInstruction;
    await call(`/workflows/${workflow.id}/procedure-graph`, { graph }, 'PATCH');
    const publish = await fetch(
      `http://127.0.0.1:4000/v1/workflows/${workflow.id}/procedure-graph/publish`,
      {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          graph,
          reviewerNote: 'Negative test: unreviewed publication must fail',
        }),
      },
    );
    if (publish.ok) throw new Error('Unreviewed draft was incorrectly published.');
    const { analysis, ...stripped } = graph;
    const bypass = await fetch(`http://127.0.0.1:4000/v1/workflows/${workflow.id}/procedure-graph`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ graph: stripped }) });
    if (bypass.ok) throw new Error('Source metadata guard could be removed.');
    console.log(
      `PASS: full processing, ${graph.steps.length} actions, playback bytes, save/reload, and rejected unreviewed publication. Draft left unapproved.`,
    );
    completed = true;
    break;
  }
  await new Promise((done) => setTimeout(done, 10_000));
}
if (!completed) throw new Error('Smoke test exceeded 15 minutes; inspect the preserved test capture.');
