import { describe, expect, it } from 'vitest';
import { describeCaptureProcessing, getProcessingMetadata, processingWorkflowId, startCaptureProcessing } from './processing-client.js';

describe('Temporal processing client boundary', () => {
  it('names workflow executions by immutable company and capture IDs', () => {
    expect(processingWorkflowId('company-1', 'capture-1')).toBe('company:company-1:capture:capture-1');
    expect(() => processingWorkflowId('', 'capture-1')).toThrow();
  });

  it('does not claim a submission when Temporal is not configured', async () => {
    const previous = process.env.TEMPORAL_ADDRESS;
    delete process.env.TEMPORAL_ADDRESS;
    await expect(startCaptureProcessing({
      companyId: '00000000-0000-7000-8000-000000000001',
      workflowId: '00000000-0000-7000-8000-000000000002',
      captureSessionId: '00000000-0000-7000-8000-000000000003',
      media: { companyId: '00000000-0000-7000-8000-000000000001', objectKey: 'companies/captures/source.mp4' },
      metadata: { modelId: 'model', modelVersion: 'version', adapterVersion: 'adapter', promptVersion: 'prompt', decodingParameters: { temperature: 0 }, inputMediaHashes: ['a'.repeat(64)], retrievedEvidenceIds: [] },
      idempotencyKey: 'capture.finalize:3',
    })).resolves.toBeUndefined();
    if (previous === undefined) delete process.env.TEMPORAL_ADDRESS;
    else process.env.TEMPORAL_ADDRESS = previous;
  });

  it('does not claim reconciliation when Temporal is not configured', async () => {
    const previous = process.env.TEMPORAL_ADDRESS;
    delete process.env.TEMPORAL_ADDRESS;
    await expect(describeCaptureProcessing('workflow-id')).resolves.toBeUndefined();
    if (previous === undefined) delete process.env.TEMPORAL_ADDRESS;
    else process.env.TEMPORAL_ADDRESS = previous;
  });

  it('pins metadata to the selected OpenAI provider model', () => {
    expect(getProcessingMetadata({ VISION_CODEF_VLM_PROVIDER: 'openai', OPENAI_VISION_MODEL: 'gpt-5-mini', VISION_CODEF_PROMPT_VERSION: 'prompt-v1' } as NodeJS.ProcessEnv)).toMatchObject({ modelId: 'gpt-5-mini', modelVersion: 'gpt-5-mini', adapterVersion: 'openai-responses-v1' });
  });
});
