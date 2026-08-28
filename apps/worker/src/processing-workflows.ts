import { continueAsNew, patched, proxyActivities, workflowInfo } from '@temporalio/workflow';
import { CONTRACT_VERSION, type MediaObjectReference, type ProcessingCompletion } from '@vision-codef/contracts';
import type { ProcessingActivities, ProcessingArtifact, ProcessingActivityContext } from './processing-activities.js';

const { finalizeCapture, transcribe, extractObservations, induceProcedure, persistProcessingCompletion } = proxyActivities<ProcessingActivities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['InvalidMediaReferenceError', 'UnsupportedMediaError', 'ProcedureDraftGraphMissingError', 'CompletionSinkUnavailableError'],
  },
});

export type CaptureProcessingInput = ProcessingActivityContext & {
  finalized?: ProcessingArtifact;
  transcript?: ProcessingArtifact;
  observations?: ProcessingArtifact;
  procedureDraft?: ProcessingArtifact;
};

export type CaptureProcessingResult = {
  companyId: string;
  captureSessionId: string;
  finalized: ProcessingArtifact;
  transcript: ProcessingArtifact;
  observations: ProcessingArtifact;
  procedureDraft: ProcessingArtifact;
};

function nextInput(input: CaptureProcessingInput, patch: Partial<CaptureProcessingInput>): CaptureProcessingInput {
  return { ...input, ...patch };
}

function artifactReference(artifact: ProcessingArtifact): MediaObjectReference {
  return { companyId: artifact.companyId, objectKey: artifact.objectKey, ...(artifact.sha256 ? { sha256: artifact.sha256 } : {}) };
}

export async function captureProcessingWorkflow(input: CaptureProcessingInput): Promise<CaptureProcessingResult> {
  void patched('capture-processing-v1');
  let finalized = input.finalized;
  if (!finalized) {
    finalized = await finalizeCapture(input);
    if (workflowInfo().continueAsNewSuggested) return continueAsNew<typeof captureProcessingWorkflow>(nextInput(input, { finalized }));
  }
  let transcript = input.transcript;
  if (!transcript) {
    transcript = await transcribe({ ...input, finalized });
    if (workflowInfo().continueAsNewSuggested) return continueAsNew<typeof captureProcessingWorkflow>(nextInput(input, { finalized, transcript }));
  }
  let observations = input.observations;
  if (!observations) {
    observations = await extractObservations({ ...input, finalized, transcript });
    if (workflowInfo().continueAsNewSuggested) return continueAsNew<typeof captureProcessingWorkflow>(nextInput(input, { finalized, transcript, observations }));
  }
  let procedureDraft = input.procedureDraft;
  if (!procedureDraft) procedureDraft = await induceProcedure({ ...input, finalized, transcript, observations });
  if (!finalized || !transcript || !observations || !procedureDraft) throw new Error('Processing workflow completed without all artifact references.');
  if (!procedureDraft.normalizedGraph) throw new Error('ProcedureDraftGraphMissingError');
  const completion: ProcessingCompletion = {
    contractVersion: CONTRACT_VERSION,
    companyId: input.companyId,
    workflowId: input.workflowId,
    captureSessionId: input.captureSessionId,
    finalized: artifactReference(finalized),
    transcript: artifactReference(transcript),
    observations: artifactReference(observations),
    procedureDraft: artifactReference(procedureDraft),
    normalizedGraph: { ...procedureDraft.normalizedGraph, published: false },
    metadata: input.metadata,
    completedAt: new Date().toISOString(),
  };
  await persistProcessingCompletion(completion);
  return { companyId: input.companyId, captureSessionId: input.captureSessionId, finalized, transcript, observations, procedureDraft };
}