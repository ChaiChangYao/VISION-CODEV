import { describe, expect, it, vi } from 'vitest';
import type { ProcessingCompletion } from '@vision-codef/contracts';
import { createHttpProcessingCompletionSink, signProcessingCompletion } from './processing-completion-sink.js';

const completion: ProcessingCompletion = {
  contractVersion: '0.1',
  companyId: '00000000-0000-7000-8000-000000000001',
  workflowId: '00000000-0000-7000-8000-000000000002',
  captureSessionId: '00000000-0000-7000-8000-000000000003',
  finalized: { companyId: '00000000-0000-7000-8000-000000000001', objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/source.mp4' },
  transcript: { companyId: '00000000-0000-7000-8000-000000000001', objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/transcript.json' },
  observations: { companyId: '00000000-0000-7000-8000-000000000001', objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/observations.json' },
  procedureDraft: { companyId: '00000000-0000-7000-8000-000000000001', objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/procedure.json' },
  normalizedGraph: {
    id: '00000000-0000-7000-8000-000000000004', version: 1, published: false, states: [], steps: [],
  },
  metadata: {
    modelId: 'paper-crane', modelVersion: '2026.08.1', adapterVersion: 'adapter-1', promptVersion: 'prompt-1',
    decodingParameters: { temperature: 0 }, inputMediaHashes: ['a'.repeat(64)], retrievedEvidenceIds: [],
  },
  completedAt: '2026-08-28T00:00:00.000Z',
};

describe('HTTP processing completion sink', () => {
  it('posts bounded completion data with a raw-body HMAC signature', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'x-vision-codef-signature': signProcessingCompletion(String(init?.body), 'secret') });
      return new Response(null, { status: 200 });
    });
    await createHttpProcessingCompletionSink({ endpoint: 'https://api.example.test/internal', secret: 'secret', fetcher })(completion);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('surfaces callback failures for Temporal retry classification', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(createHttpProcessingCompletionSink({ endpoint: 'https://api.example.test/internal', secret: 'secret', fetcher })(completion)).rejects.toThrow('503');
  });
});
