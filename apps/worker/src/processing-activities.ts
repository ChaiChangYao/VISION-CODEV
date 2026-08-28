import { MediaObjectReferenceSchema, ProcessingCompletionSchema, ProcedureGraphSchema, type MediaObjectReference, type ProcessingCompletion, type ProcessingMetadata, type ProcedureGraph } from '@vision-codef/contracts';

export class InvalidMediaReferenceError extends Error {}

export type ProcessingActivityContext = {
  companyId: string;
  workflowId: string;
  captureSessionId: string;
  media: MediaObjectReference;
  metadata: ProcessingMetadata;
  idempotencyKey: string;
};

export type ProcessingArtifact = MediaObjectReference & { kind: 'media' | 'transcript' | 'observations' | 'procedure-draft'; normalizedGraph?: ProcedureGraph };

export type ProcessingActivityHandlers = {
  finalizeCapture(input: ProcessingActivityContext): Promise<ProcessingArtifact>;
  transcribe(input: ProcessingActivityContext & { finalized: ProcessingArtifact }): Promise<ProcessingArtifact>;
  extractObservations(input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact }): Promise<ProcessingArtifact>;
  induceProcedure(input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact; observations: ProcessingArtifact }): Promise<ProcessingArtifact>;
  persistProcessingCompletion?(input: ProcessingCompletion): Promise<void>;
};

export type ProcessingActivities = {
  finalizeCapture(input: ProcessingActivityContext): Promise<ProcessingArtifact>;
  transcribe(input: ProcessingActivityContext & { finalized: ProcessingArtifact }): Promise<ProcessingArtifact>;
  extractObservations(input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact }): Promise<ProcessingArtifact>;
  induceProcedure(input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact; observations: ProcessingArtifact }): Promise<ProcessingArtifact>;
  persistProcessingCompletion(input: ProcessingCompletion): Promise<void>;
};

function validateArtifact(value: ProcessingArtifact, expectedCompanyId: string): ProcessingArtifact {
  MediaObjectReferenceSchema.parse(value);
  if (value.companyId !== expectedCompanyId || !value.objectKey.startsWith('companies/' + expectedCompanyId + '/')) throw new InvalidMediaReferenceError('Processing artifact is outside the requesting company boundary.');
  if (!['media', 'transcript', 'observations', 'procedure-draft'].includes(value.kind)) throw new Error('Processing activity returned an invalid artifact kind.');
  if (value.normalizedGraph) ProcedureGraphSchema.parse(value.normalizedGraph);
  return value;
}

export function createProcessingActivities(handlers: ProcessingActivityHandlers): ProcessingActivities {
  return {
    async finalizeCapture(input) { return validateArtifact(await handlers.finalizeCapture(input), input.companyId); },
    async transcribe(input) { return validateArtifact(await handlers.transcribe(input), input.companyId); },
    async extractObservations(input) { return validateArtifact(await handlers.extractObservations(input), input.companyId); },
    async induceProcedure(input) { return validateArtifact(await handlers.induceProcedure(input), input.companyId); },
    async persistProcessingCompletion(input) {
      const completion = ProcessingCompletionSchema.parse(input);
      if (!handlers.persistProcessingCompletion) throw new Error('CompletionSinkUnavailableError');
      await handlers.persistProcessingCompletion(completion);
    },
  };
}