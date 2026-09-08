import { describe, expect, it, vi } from 'vitest';

import {
  createConfiguredProcessingProviderHandlers,
  createHttpProcessingProviderHandlers,
  InvalidMediaReferenceError,
} from './processing-provider.js';

const context = {
  companyId: '00000000-0000-7000-8000-000000000001',
  workflowId: '00000000-0000-7000-8000-000000000002',
  captureSessionId: '00000000-0000-7000-8000-000000000003',
  media: {
    companyId: '00000000-0000-7000-8000-000000000001',
    objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/source.mp4',
  },
  metadata: {
    modelId: 'paper-crane',
    modelVersion: '2026.08.1',
    adapterVersion: 'adapter-1',
    promptVersion: 'prompt-1',
    decodingParameters: { temperature: 0 },
    inputMediaHashes: ['a'.repeat(64)],
    retrievedEvidenceIds: [],
  },
  idempotencyKey: 'capture-3-finalize',
};

describe('HTTP processing provider boundary', () => {
  it('sends only bounded references and validates the returned artifact', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://processing.example.test/v1/processing/finalize');
      expect(init?.headers).toMatchObject({ 'idempotency-key': context.idempotencyKey });
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).not.toHaveProperty('bytes');
      return new Response(JSON.stringify({ data: { ...context.media, kind: 'media' } }), { status: 200 });
    });
    const handlers = createHttpProcessingProviderHandlers({ baseUrl: 'https://processing.example.test/', fetcher });

    await expect(handlers.finalizeCapture(context)).resolves.toEqual({ ...context.media, kind: 'media' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('classifies invalid media responses as non-retryable', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 400 }));
    const handlers = createHttpProcessingProviderHandlers({ baseUrl: 'https://processing.example.test', fetcher });

    await expect(handlers.finalizeCapture(context)).rejects.toBeInstanceOf(InvalidMediaReferenceError);
  });

  it('fails closed when no processing provider is configured', () => {
    expect(() => createConfiguredProcessingProviderHandlers({})).toThrow('VISION_CODEF_PROCESSING_PROVIDER_URL');
  });

  it('heartbeats immediately while waiting on a provider request', async () => {
    const heartbeat = vi.fn();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: { ...context.media, kind: 'media' } }), { status: 200 }));
    const handlers = createHttpProcessingProviderHandlers({ baseUrl: 'https://processing.example.test', fetcher, heartbeat });
    await handlers.finalizeCapture(context);
    expect(heartbeat).toHaveBeenCalledWith({ endpoint: 'finalize', state: 'requesting' });
  });
});
