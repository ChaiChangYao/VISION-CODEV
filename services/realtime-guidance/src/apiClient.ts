import {
  GuidanceConnectionSchema,
  GuidanceDecisionSchema,
  type GuidanceConnection,
  type GuidanceDecision,
  type PaperCraneObservation,
} from './contracts.js';

export type GuidanceIdentity = {
  companyId: string;
  memberId: string;
  workflowId: string;
  deploymentId: string;
};

export class GuidanceApiClient {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly identity: GuidanceIdentity,
    private readonly serviceSecret: string,
    private readonly apiBearerToken?: string,
  ) {}

  async connection(): Promise<GuidanceConnection> {
    const response = await fetch(`${this.apiBaseUrl}/v1/internal/guidance-token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.serviceSecret}`,
      },
      body: JSON.stringify(this.identity),
    });
    return GuidanceConnectionSchema.parse(await responseData(response, 'Guidance token request'));
  }

  async evaluate(
    observationPath: string,
    observation: PaperCraneObservation,
  ): Promise<GuidanceDecision> {
    const response = await fetch(`${this.apiBaseUrl}${observationPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-company-id': this.identity.companyId,
        'x-member-id': this.identity.memberId,
        ...(this.apiBearerToken ? { authorization: `Bearer ${this.apiBearerToken}` } : {}),
      },
      body: JSON.stringify(observation),
    });
    return GuidanceDecisionSchema.parse(await responseData(response, 'Observation evaluation'));
  }
}

async function responseData(response: Response, label: string): Promise<unknown> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = extractError(payload) ?? `${label} failed (${response.status}).`;
    throw new Error(message);
  }
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

function extractError(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('data' in value)) return undefined;
  const data = (value as { data: unknown }).data;
  if (typeof data !== 'object' || data === null || !('error' in data)) return undefined;
  const error = (data as { error: unknown }).error;
  if (typeof error !== 'object' || error === null || !('message' in error)) return undefined;
  return typeof (error as { message: unknown }).message === 'string'
    ? (error as { message: string }).message
    : undefined;
}
