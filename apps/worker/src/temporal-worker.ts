import { NativeConnection, Worker } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import { PROCESSING_TASK_QUEUE } from './worker.js';
import { createProcessingActivities, type ProcessingActivities, type ProcessingActivityHandlers } from './processing-activities.js';
import { configuredProcessingCompletionSink } from './processing-completion-sink.js';
import { createConfiguredProcessingProviderHandlers } from './processing-provider.js';

export async function runTemporalWorker(activities: ProcessingActivities): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS;
  if (!address) throw new Error('TEMPORAL_ADDRESS is required to run the processing worker.');
  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: PROCESSING_TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL('./processing-workflows.js', import.meta.url)),
    activities,
  });
  await worker.run();
}

export function createConfiguredProcessingActivities(
  handlers: Omit<ProcessingActivityHandlers, 'persistProcessingCompletion'>,
  env: NodeJS.ProcessEnv = process.env,
): ProcessingActivities {
  const completionSink = configuredProcessingCompletionSink(env);
  if (!completionSink) throw new Error('PROCESSING_COMPLETION_URL and VISION_CODEF_PROCESSING_WEBHOOK_SECRET are required to run the processing worker.');
  return createProcessingActivities({ ...handlers, persistProcessingCompletion: completionSink });
}

export async function runConfiguredTemporalWorker(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const handlers = createConfiguredProcessingProviderHandlers(env);
  await runTemporalWorker(createConfiguredProcessingActivities(handlers, env));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runConfiguredTemporalWorker().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
