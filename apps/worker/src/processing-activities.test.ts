import { describe, expect, it } from 'vitest';
import { createProcessingActivities, type ProcessingActivityHandlers } from './processing-activities.js';

const media = { companyId: '00000000-0000-7000-8000-000000000001', objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/source.mp4', kind: 'media' as const };
const context = { companyId: media.companyId, workflowId: '00000000-0000-7000-8000-000000000002', captureSessionId: '00000000-0000-7000-8000-000000000003', media, idempotencyKey: 'capture-3-finalize', metadata: { modelId: 'vision-codef-paper-crane', modelVersion: 'unconfigured', adapterVersion: 'unconfigured', promptVersion: 'unconfigured', decodingParameters: { temperature: 0 }, inputMediaHashes: ['a'.repeat(64)], retrievedEvidenceIds: [] } };

describe('Temporal processing activity boundary', () => {
  it('validates handler artifacts and carries object references only', async () => {
    const handlers: ProcessingActivityHandlers = {
      async finalizeCapture(input) { return { ...input.media, kind: 'media' }; },
      async transcribe(input) { return { companyId: input.companyId, objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/transcript.json', kind: 'transcript' }; },
      async extractObservations(input) { return { companyId: input.companyId, objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/observations.json', kind: 'observations' }; },
      async induceProcedure(input) { return { companyId: input.companyId, objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/procedure.json', kind: 'procedure-draft' }; },
    };
    const activities = createProcessingActivities(handlers);
    const finalized = await activities.finalizeCapture(context);
    const transcript = await activities.transcribe({ ...context, finalized });
    expect(transcript).toEqual({ companyId: context.companyId, objectKey: 'companies/00000000-0000-7000-8000-000000000001/captures/transcript.json', kind: 'transcript' });
  });
});
