import { NativeConnection, Worker } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import { PROCESSING_TASK_QUEUE } from './worker.js';
import type { ProcessingActivities } from './processing-activities.js';

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
