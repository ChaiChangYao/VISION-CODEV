import { describe, expect, it } from 'vitest';
import { createProcessingActivities, type ProcessingActivityHandlers } from './processing-activities.js';

const companyId = '00000000-0000-7000-8000-000000000001';
const context = {
  companyId,
  workflowId: '00000000-0000-7000-8000-000000000002',
  captureSessionId: '00000000-0000-7000-8000-000000000003',
  media: { companyId, objectKey: `companies/${companyId}/captures/source.mp4` },
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

describe('Temporal processing artifact isolation', () => {
  it('rejects an artifact from another company before persistence', async () => {
    const handlers: ProcessingActivityHandlers = {
      async finalizeCapture(input) { return { ...input.media, kind: 'media' }; },
      async transcribe() { return { companyId: '00000000-0000-7000-8000-000000000099', objectKey: 'companies/00000000-0000-7000-8000-000000000099/captures/transcript.json', kind: 'transcript' }; },
      async extractObservations(input) { return { ...input.finalized, kind: 'observations' }; },
      async induceProcedure(input) { return { ...input.finalized, kind: 'procedure-draft' }; },
    };
    const activities = createProcessingActivities(handlers);
    const finalized = await activities.finalizeCapture(context);

    await expect(activities.transcribe({ ...context, finalized })).rejects.toThrow('company boundary');
  });
});
