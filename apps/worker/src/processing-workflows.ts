import { continueAsNew, patched, proxyActivities, workflowInfo } from '@temporalio/workflow';
import { CONTRACT_VERSION, type MediaObjectReference, type ProcessingCompletion } from '@vision-codef/contracts';
import type { ProcessingActivities, ProcessingArtifact, ProcessingActivityContext } from './processing-activities.js';

const { finalizeCapture, transcribe, extractObservations, induceProcedure, persistProcessingCompletion, reportProcessingProgress } = proxyActivities<ProcessingActivities>({
  startToCloseTimeout: '60 minutes',
  heartbeatTimeout: '30 seconds',
  retry: {
    maximumAttempts: 5,
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
  const progress = async (stage: 'queued' | 'finalizing' | 'transcribing' | 'observing' | 'inducing' | 'completing' | 'failed', percentage: number, message: string) => {
    try { await reportProcessingProgress({ companyId: input.companyId, workflowId: input.workflowId, captureSessionId: input.captureSessionId, stage, progress: percentage, message, reportedAt: new Date().toISOString() }); }
    catch { /* Progress reporting must never prevent durable processing. */ }
  };
  const runStage = async <T>(stage: Exclude<Parameters<typeof progress>[0], 'queued' | 'failed'>, percentage: number, message: string, operation: () => Promise<T>): Promise<T> => {
    await progress(stage, percentage, message);
    try { return await operation(); }
    catch (error) {
      let detail = error instanceof Error ? error.message : String(error);
      let cause = error instanceof Error ? error.cause : undefined;
      for (let depth = 0; cause && depth < 3; depth += 1) {
        const causeMessage = cause instanceof Error ? cause.message : String(cause);
        if (causeMessage && !detail.includes(causeMessage)) detail += `: ${causeMessage}`;
        cause = cause instanceof Error ? cause.cause : undefined;
      }
      await progress('failed', percentage, `${message} Failed: ${detail}`.slice(0, 500));
      throw error;
    }
  };
  let finalized = input.finalized;
  if (!finalized) {
    finalized = await runStage('finalizing', 10, 'Validating and downloading the canonical recording.', () => finalizeCapture(input));
    if (workflowInfo().continueAsNewSuggested) return continueAsNew<typeof captureProcessingWorkflow>(nextInput(input, { finalized }));
  }
  let transcript = input.transcript;
  if (!transcript) {
    transcript = await runStage('transcribing', 25, 'Preparing the audio transcript.', () => transcribe({ ...input, finalized: finalized! }));
    if (workflowInfo().continueAsNewSuggested) return continueAsNew<typeof captureProcessingWorkflow>(nextInput(input, { finalized, transcript }));
  }
  let observations = input.observations;
  if (!observations) {
    observations = await runStage('observing', 45, 'Sampling frames and running visual analysis.', () => extractObservations({ ...input, finalized: finalized!, transcript: transcript! }));
    if (workflowInfo().continueAsNewSuggested) return continueAsNew<typeof captureProcessingWorkflow>(nextInput(input, { finalized, transcript, observations }));
  }
  let procedureDraft = input.procedureDraft;
  if (!procedureDraft) {
    procedureDraft = await runStage('inducing', 80, 'Building the draft procedure graph.', () => induceProcedure({ ...input, finalized: finalized!, transcript: transcript!, observations: observations! }));
  }
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
  await runStage('completing', 95, 'Saving the draft and notifying the workspace.', () => persistProcessingCompletion(completion));
  return { companyId: input.companyId, captureSessionId: input.captureSessionId, finalized, transcript, observations, procedureDraft };
}
