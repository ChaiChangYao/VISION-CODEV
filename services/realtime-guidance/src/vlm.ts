import {
  PaperCraneObservationSchema,
  type FrameSample,
  type PaperCraneObservation,
} from './contracts.js';

export type VlmContext = {
  companyId: string;
  workflowId: string;
  deploymentId: string;
};

export interface VlmProvider {
  observe(frame: FrameSample, context: VlmContext): Promise<unknown>;
}

export class FixtureVlmProvider implements VlmProvider {
  constructor(private readonly observation: unknown) {}

  async observe(frame: FrameSample): Promise<unknown> {
    const parsed = PaperCraneObservationSchema.parse(this.observation);
    return { ...parsed, timestampMs: frame.timestampMs } satisfies PaperCraneObservation;
  }
}

/**
 * Provider-neutral HTTP boundary. The configured service receives one RGBA frame
 * and must return only the structured observation contract.
 */
export class HttpVlmProvider implements VlmProvider {
  constructor(
    private readonly endpoint: string,
    private readonly bearerToken?: string,
  ) {}

  async observe(frame: FrameSample, context: VlmContext): Promise<unknown> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}),
      },
      body: JSON.stringify({
        contract: 'vision-codef.paper-crane-observation.v1',
        context,
        frame: {
          width: frame.width,
          height: frame.height,
          pixelFormat: frame.pixelFormat,
          timestampMs: frame.timestampMs,
          dataBase64: Buffer.from(frame.data).toString('base64'),
        },
      }),
    });
    if (!response.ok) throw new Error(`VLM observation request failed (${response.status}).`);
    const payload: unknown = await response.json();
    return unwrapData(payload);
  }
}

function unwrapData(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data: unknown }).data;
  }
  return value;
}
