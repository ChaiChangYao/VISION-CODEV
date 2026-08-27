import { Client, Connection } from '@temporalio/client';
import { ProcessingMetadataSchema, type MediaObjectReference, type ProcessingMetadata } from '@vision-codef/contracts';

export const PROCESSING_TASK_QUEUE = 'vision-codef-processing';

export type CaptureProcessingRequest = {
  companyId: string;
  workflowId: string;
  captureSessionId: string;
  media: MediaObjectReference;
  metadata: ProcessingMetadata;
  idempotencyKey: string;
};

export type ProcessingWorkflowHandle = { workflowId: string; runId: string };

export function getProcessingMetadata(env: NodeJS.ProcessEnv = process.env): ProcessingMetadata | undefined {
  const result = ProcessingMetadataSchema.safeParse({
    modelId: env.VISION_CODEF_MODEL_ID,
    modelVersion: env.VISION_CODEF_MODEL_VERSION,
    adapterVersion: env.VISION_CODEF_ADAPTER_VERSION,
    promptVersion: env.VISION_CODEF_PROMPT_VERSION,
    decodingParameters: { temperature: Number(env.VISION_CODEF_DECODING_TEMPERATURE ?? 0) },
    inputMediaHashes: env.VISION_CODEF_INPUT_MEDIA_HASHES?.split(',').map((value) => value.trim()).filter(Boolean) ?? [],
    retrievedEvidenceIds: env.VISION_CODEF_RETRIEVED_EVIDENCE_IDS?.split(',').map((value) => value.trim()).filter(Boolean) ?? [],
  });
  return result.success ? result.data : undefined;
}

export function processingWorkflowId(companyId: string, captureSessionId: string): string {
  if (!companyId || !captureSessionId) throw new Error('companyId and captureSessionId are required.');
  return `company:${companyId}:capture:${captureSessionId}`;
}

export async function startCaptureProcessing(input: CaptureProcessingRequest): Promise<ProcessingWorkflowHandle | undefined> {
  const address = process.env.TEMPORAL_ADDRESS;
  if (!address) return undefined;
  const connection = await Connection.connect({ address });
  try {
    const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default' });
    const handle = await client.workflow.start('captureProcessingWorkflow', {
      workflowId: processingWorkflowId(input.companyId, input.captureSessionId),
      taskQueue: PROCESSING_TASK_QUEUE,
      args: [input],
      memo: { companyId: input.companyId, captureSessionId: input.captureSessionId },
      searchAttributes: process.env.TEMPORAL_SEARCH_ATTRIBUTES_ENABLED === 'true'
        ? { company_id: [input.companyId], capture_session_id: [input.captureSessionId] }
        : undefined,
    });
    return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
  } finally {
    await connection.close();
  }
}
