import { createHmac } from 'node:crypto';
import type { ProcessingCompletion } from '@vision-codef/contracts';

export type ProcessingCompletionSinkOptions = {
  endpoint: string;
  secret: string;
  fetcher?: typeof fetch;
};

export function signProcessingCompletion(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

export function createHttpProcessingCompletionSink(options: ProcessingCompletionSinkOptions): (input: ProcessingCompletion) => Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  return async (input) => {
    const body = JSON.stringify(input);
    const response = await fetcher(options.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vision-codef-signature': signProcessingCompletion(body, options.secret),
      },
      body,
    });
    if (!response.ok) throw new Error(`Processing completion callback failed (${response.status}).`);
  };
}

export function configuredProcessingCompletionSink(env: NodeJS.ProcessEnv = process.env): ((input: ProcessingCompletion) => Promise<void>) | undefined {
  const endpoint = env.PROCESSING_COMPLETION_URL;
  const secret = env.VISION_CODEF_PROCESSING_WEBHOOK_SECRET;
  return endpoint && secret ? createHttpProcessingCompletionSink({ endpoint, secret }) : undefined;
}
