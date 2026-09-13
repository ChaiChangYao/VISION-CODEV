export type PairedTutorial = {
  deploymentId: string;
  workflowId: string;
  deviceId: string;
  roomName: string;
};

export type TutorialApiConfig = {
  pairingEndpoint: string;
  tokenEndpoint: string;
  companyId: string;
  memberId: string;
  deviceId: string;
  request?: typeof fetch;
};

export type TutorialAccess = { token: string; currentInstruction: string };

export async function claimTutorial(
  config: TutorialApiConfig,
  pairingCode: string,
): Promise<PairedTutorial> {
  if (!/^\d{6}$/.test(pairingCode)) throw new Error('Enter the six-digit tutorial code.');
  const response = await (config.request ?? fetch)(config.pairingEndpoint, {
    method: 'POST',
    headers: tenantHeaders(config),
    body: JSON.stringify({ pairingCode, deviceId: config.deviceId }),
  });
  const data = unwrap(await response.json());
  if (!response.ok) throw new Error(apiMessage(data) ?? `Tutorial pairing failed (${response.status}).`);
  if (!isPairedTutorial(data)) throw new Error('Tutorial pairing response was invalid.');
  return data;
}

export async function requestTutorialAccess(
  config: TutorialApiConfig,
  tutorial: PairedTutorial,
): Promise<TutorialAccess> {
  const response = await (config.request ?? fetch)(config.tokenEndpoint, {
    method: 'POST',
    headers: tenantHeaders(config),
    body: JSON.stringify({
      deploymentId: tutorial.deploymentId,
      workflowId: tutorial.workflowId,
      deviceId: config.deviceId,
      memberId: config.memberId,
    }),
  });
  const data = unwrap(await response.json());
  if (!response.ok) throw new Error(apiMessage(data) ?? `Tutorial token request failed (${response.status}).`);
  if (!isRecord(data) || typeof data.token !== 'string' || !data.token || typeof data.currentInstruction !== 'string' || !data.currentInstruction.trim()) {
    throw new Error('Tutorial token response did not contain approved guidance.');
  }
  return { token: data.token, currentInstruction: data.currentInstruction.trim() };
}

function tenantHeaders(config: TutorialApiConfig): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-company-id': config.companyId,
    'x-member-id': config.memberId,
  };
}

function unwrap(value: unknown): unknown {
  return isRecord(value) && 'data' in value ? value.data : value;
}

function apiMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const error = isRecord(value.error) ? value.error : value;
  return typeof error.message === 'string' ? error.message : undefined;
}

function isPairedTutorial(value: unknown): value is PairedTutorial {
  return (
    isRecord(value) &&
    ['deploymentId', 'workflowId', 'deviceId', 'roomName'].every(
      (key) => typeof value[key] === 'string' && value[key].length > 0,
    )
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
