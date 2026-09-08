import { describe, expect, it, vi } from 'vitest';

import type { ProcedureAnnotationInput } from '@vision-codef/contracts';
import { createApiClient } from './api-client';

const workflowId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e21';
const annotationId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e22';

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, traceId: annotationId, schemaVersion: '0.1' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('annotation API client', () => {
  it('uses the governed annotation and reference-pack routes', async () => {
    const annotation = {
      id: annotationId,
      workflowId,
      reviewStatus: 'approved',
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/reference-pack/publish')) return response({ id: annotationId, workflowId, entries: [] }, 201);
      return response(annotation, 201);
    });
    const fetcher = fetchMock as unknown as typeof fetch;
    const client = createApiClient({ baseUrl: 'https://api.test', fetcher });
    const input = {
      stepId: annotationId,
      captureSessionId: annotationId,
      startMs: 0,
      endMs: 1000,
      verdict: 'correct',
      objectName: 'brake pad',
      observedAction: 'pad installed',
      expectedState: 'pad seated',
      expectedNextAction: 'inspect pad',
      reasoning: 'Retaining features are visible.',
      documentEvidence: [],
      origin: 'senior',
      reviewStatus: 'approved',
    } satisfies ProcedureAnnotationInput;

    await client.createAnnotation(workflowId, input);
    await client.updateAnnotation(annotationId, input);
    await client.publishReferencePack(workflowId);

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `https://api.test/v1/workflows/${workflowId}/annotations`,
      `https://api.test/v1/annotations/${annotationId}`,
      `https://api.test/v1/workflows/${workflowId}/reference-pack/publish`,
    ]);
  });

  it('preserves errors nested in the API envelope', async () => {
    const fetcher = vi.fn(async () => response({ error: { code: 'NOT_FOUND', message: 'No reference pack.' } }, 404)) as unknown as typeof fetch;
    const client = createApiClient({ baseUrl: 'https://api.test', fetcher });
    await expect(client.getReferencePack(workflowId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No reference pack.',
    });
  });

  it('uploads MP4 bytes without replacing their media content type', async () => {
    const capture = { id: annotationId, workflowId, state: 'completed', source: 'import', connectionStatus: 'disconnected', mediaAsset: { id: annotationId, state: 'available' } };
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response(capture, 201));
    const client = createApiClient({ baseUrl: 'https://api.test', fetcher: fetchMock as unknown as typeof fetch });
    const file = new File([Uint8Array.from([0, 1, 2, 3])], 'server run.mp4', { type: 'video/mp4' });

    const imported = await client.importCapture(workflowId, file, 31_950);

    expect(imported.source).toBe('import');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(`/v1/workflows/${workflowId}/capture-sessions/import?`);
    expect(String(url)).toContain('filename=server+run.mp4');
    expect(new Headers(init?.headers).get('content-type')).toBe('video/mp4');
    expect(init?.body).toBe(file);
  });

  it('retrieves imported media as authenticated binary content', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(Uint8Array.from([0, 1, 2]), { headers: { 'content-type': 'video/mp4' } }));
    const client = createApiClient({
      baseUrl: 'https://api.test',
      tenant: { companyId: workflowId, memberId: annotationId },
      fetcher: fetchMock as unknown as typeof fetch,
    });

    const media = await client.getMediaContent(annotationId);

    expect(media.size).toBe(3);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get('x-company-id')).toBe(workflowId);
    expect(new Headers(init?.headers).get('x-member-id')).toBe(annotationId);
  });
});
