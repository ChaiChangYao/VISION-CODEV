import { createHmac } from 'node:crypto';

export type ProcessingProgress = {
  companyId: string;
  workflowId: string;
  captureSessionId: string;
  stage: 'queued' | 'finalizing' | 'transcribing' | 'observing' | 'inducing' | 'completing' | 'failed';
  progress: number;
  message: string;
  reportedAt: string;
};

export function signProcessingProgress(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

export function createHttpProcessingProgressSink(options: { endpoint: string; secret: string; fetcher?: typeof fetch }) {
  const fetcher = options.fetcher ?? fetch;
  return async (input: ProcessingProgress): Promise<void> => {
    const body = JSON.stringify(input);
    const response = await fetcher(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vision-codef-signature': signProcessingProgress(body, options.secret) },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Processing progress callback failed (${response.status}).`);
  };
}

export function configuredProcessingProgressSink(env: NodeJS.ProcessEnv = process.env) {
  const endpoint = env.PROCESSING_PROGRESS_URL;
  const secret = env.VISION_CODEF_PROCESSING_WEBHOOK_SECRET;
  return endpoint && secret ? createHttpProcessingProgressSink({ endpoint, secret }) : undefined;
}
