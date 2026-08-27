import { MediaObjectReferenceSchema, type MediaObjectReference, type ProcessingMetadata } from '@vision-codef/contracts';

export type ProcessingActivityContext = {
  companyId: string;
  workflowId: string;
  captureSessionId: string;
  media: MediaObjectReference;
  metadata: ProcessingMetadata;
  idempotencyKey: string;
};

export type ProcessingArtifact = MediaObjectReference & { kind: 'media' | 'transcript' | 'observations' | 'procedure-draft' };

export type ProcessingActivityHandlers = {
  finalizeCapture(input: ProcessingActivityContext): Promise<ProcessingArtifact>;
  transcribe(input: ProcessingActivityContext & { finalized: ProcessingArtifact }): Promise<ProcessingArtifact>;
  extractObservations(input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact }): Promise<ProcessingArtifact>;
  induceProcedure(input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact; observations: ProcessingArtifact }): Promise<ProcessingArtifact>;
};

export type ProcessingActivities = {
  finalizeCapture(input: ProcessingActivityContext): Promise<ProcessingArtifact>;
  transcribe(input: ProcessingActivityContext & { finalized: ProcessingArtifact }): Promise<ProcessingArtifact>;
  extractObservations(input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact }): Promise<ProcessingArtifact>;
  induceProcedure(input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact; observations: ProcessingArtifact }): Promise<ProcessingArtifact>;
};

function validateArtifact(value: ProcessingArtifact): ProcessingArtifact {
  MediaObjectReferenceSchema.parse(value);
  if (!['media', 'transcript', 'observations', 'procedure-draft'].includes(value.kind)) throw new Error('Processing activity returned an invalid artifact kind.');
  return value;
}

export function createProcessingActivities(handlers: ProcessingActivityHandlers): ProcessingActivities {
  return {
    async finalizeCapture(input) { return validateArtifact(await handlers.finalizeCapture(input)); },
    async transcribe(input) { return validateArtifact(await handlers.transcribe(input)); },
    async extractObservations(input) { return validateArtifact(await handlers.extractObservations(input)); },
    async induceProcedure(input) { return validateArtifact(await handlers.induceProcedure(input)); },
  };
}
