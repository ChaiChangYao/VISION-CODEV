import { NativeConnection, Worker } from '@temporalio/worker';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { PROCESSING_TASK_QUEUE } from './worker.js';
import { createProcessingActivities, type ProcessingActivities, type ProcessingActivityHandlers } from './processing-activities.js';
import { configuredProcessingCompletionSink } from './processing-completion-sink.js';
import { configuredProcessingProgressSink } from './processing-progress-sink.js';
import { createConfiguredProcessingProviderHandlers } from './processing-provider.js';

export async function runTemporalWorker(activities: ProcessingActivities, onReady?: (worker: Worker) => void): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS;
  if (!address) throw new Error('TEMPORAL_ADDRESS is required to run the processing worker.');
  const connection = await NativeConnection.connect({ address });
  const sourceRuntime = fileURLToPath(import.meta.url).endsWith('.ts');
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: PROCESSING_TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL(sourceRuntime ? './processing-workflows.ts' : './processing-workflows.js', import.meta.url)),
    activities,
    shutdownGraceTime: '30 seconds',
  });
  onReady?.(worker);
  try { await worker.run(); }
  finally { await connection.close(); }
}

export function createConfiguredProcessingActivities(
  handlers: Omit<ProcessingActivityHandlers, 'persistProcessingCompletion'>,
  env: NodeJS.ProcessEnv = process.env,
): ProcessingActivities {
  const completionSink = configuredProcessingCompletionSink(env);
  if (!completionSink) throw new Error('PROCESSING_COMPLETION_URL and VISION_CODEF_PROCESSING_WEBHOOK_SECRET are required to run the processing worker.');
  const progressSink = configuredProcessingProgressSink(env);
  return createProcessingActivities({ ...handlers, persistProcessingCompletion: completionSink, ...(progressSink ? { reportProcessingProgress: progressSink } : {}) });
}

export async function runConfiguredTemporalWorker(env: NodeJS.ProcessEnv = process.env, onReady?: (worker: Worker) => void): Promise<void> {
  const handlers = createConfiguredProcessingProviderHandlers(env);
  await runTemporalWorker(createConfiguredProcessingActivities(handlers, env), onReady);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const startedAt = new Date().toISOString();
  let worker: Worker | undefined;
  let failure: string | undefined;
  const healthPort = Number(process.env.PROCESSING_WORKER_HEALTH_PORT ?? 8093);
  const healthServer = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/health') { response.writeHead(404).end(); return; }
    const state = worker?.getState() ?? (failure ? 'FAILED' : 'STARTING');
    const healthy = state === 'RUNNING';
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: healthy ? 'ok' : 'unavailable', service: 'processing-worker', state, taskQueue: PROCESSING_TASK_QUEUE, startedAt, failure }));
  });
  healthServer.listen(healthPort, '127.0.0.1');
  runConfiguredTemporalWorker(process.env, (readyWorker) => { worker = readyWorker; }).catch((error: unknown) => {
    failure = error instanceof Error ? error.message : String(error);
    console.error(error instanceof Error ? error.message : String(error));
    healthServer.close(() => process.exit(1));
  });
}
