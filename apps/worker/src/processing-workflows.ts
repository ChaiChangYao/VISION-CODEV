import { continueAsNew, patched, proxyActivities, workflowInfo } from '@temporalio/workflow';
import type { ProcessingActivities, ProcessingArtifact, ProcessingActivityContext } from './processing-activities.js';

const { finalizeCapture, transcribe, extractObservations, induceProcedure } = proxyActivities<ProcessingActivities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['InvalidMediaReferenceError', 'UnsupportedMediaError'],
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
  return { companyId: input.companyId, captureSessionId: input.captureSessionId, finalized, transcript, observations, procedureDraft };
}
