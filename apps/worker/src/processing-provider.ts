import {
  MediaObjectReferenceSchema,
  type MediaObjectReference,
  type ProcessingMetadata,
} from '@vision-codef/contracts';
import type { ProcessingActivityContext, ProcessingArtifact } from './processing-activities.js';
import { heartbeat as temporalHeartbeat } from '@temporalio/activity';

export type ProcessingProviderClientOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
  heartbeat?: (details?: unknown) => void;
};

export class InvalidMediaReferenceError extends Error {}
export class UnsupportedMediaError extends Error {}
export class ProcessingProviderUnavailableError extends Error {}

type ProviderInput = {
  companyId: string;
  workflowId: string;
  captureSessionId: string;
  media: MediaObjectReference;
  metadata: ProcessingMetadata;
  idempotencyKey: string;
  finalized?: ProcessingArtifact;
  transcript?: ProcessingArtifact;
  observations?: ProcessingArtifact;
};

export function createHttpProcessingProviderHandlers(options: ProcessingProviderClientOptions) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  async function call(endpoint: string, input: ProviderInput): Promise<ProcessingArtifact> {
    options.heartbeat?.({ endpoint, state: 'requesting' });
    const heartbeatTimer = options.heartbeat ? setInterval(() => options.heartbeat?.({ endpoint, state: 'waiting-for-provider' }), 10_000) : undefined;
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/v1/processing/${endpoint}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': input.idempotencyKey,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(6 * 60_000),
      });
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }
    if (response.status === 400) throw new InvalidMediaReferenceError(`Processing provider rejected ${endpoint} input.`);
    if (response.status === 415) throw new UnsupportedMediaError(`Processing provider does not support ${endpoint} media.`);
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500).trim();
      throw new ProcessingProviderUnavailableError(
        `Processing provider ${endpoint} failed (${response.status})${detail ? `: ${detail}` : '.'}`,
      );
    }
    const payload: unknown = await response.json();
    const value = unwrapData(payload);
    if (!isArtifact(value)) throw new Error(`Processing provider returned an invalid ${endpoint} artifact.`);
    return value;
  }

  return {
    finalizeCapture: (input: ProcessingActivityContext) => call('finalize', input),
    transcribe: (input: ProcessingActivityContext & { finalized: ProcessingArtifact }) => call('transcribe', input),
    extractObservations: (input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact }) => call('observations', input),
    induceProcedure: (input: ProcessingActivityContext & { finalized: ProcessingArtifact; transcript: ProcessingArtifact; observations: ProcessingArtifact }) => call('procedure', input),
  };
}

export function createConfiguredProcessingProviderHandlers(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env.VISION_CODEF_PROCESSING_PROVIDER_URL?.trim();
  if (!baseUrl) throw new ProcessingProviderUnavailableError('VISION_CODEF_PROCESSING_PROVIDER_URL is required to run Temporal processing.');
  return createHttpProcessingProviderHandlers({ baseUrl, heartbeat: temporalHeartbeat });
}

function unwrapData(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'data' in value
    ? (value as { data: unknown }).data
    : value;
}

function isArtifact(value: unknown): value is ProcessingArtifact {
  if (typeof value !== 'object' || value === null) return false;
  const input = value as Record<string, unknown>;
  if (!['media', 'transcript', 'observations', 'procedure-draft'].includes(String(input.kind))) return false;
  return MediaObjectReferenceSchema.safeParse(input).success;
}
