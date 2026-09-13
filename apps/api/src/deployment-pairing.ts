import { randomInt } from 'node:crypto';

export const DEPLOYMENT_PAIRING_TTL_MS = 10 * 60 * 1000;

export type PairableDeployment = {
  pairingCode?: string;
  pairingExpiresAt?: string;
  pairedDeviceId?: string;
};

export function pairingIsActive(
  deployment: PairableDeployment,
  currentTime = Date.now(),
): boolean {
  return Boolean(
    deployment.pairingCode &&
      deployment.pairingExpiresAt &&
      Date.parse(deployment.pairingExpiresAt) > currentTime,
  );
}

export function createDeploymentPairing(
  deployments: Iterable<PairableDeployment>,
  options: {
    currentTime?: number;
    ttlMs?: number;
    generateCode?: () => string;
  } = {},
): { pairingCode: string; pairingExpiresAt: string } {
  const currentTime = options.currentTime ?? Date.now();
  const ttlMs = options.ttlMs ?? DEPLOYMENT_PAIRING_TTL_MS;
  const generateCode = options.generateCode ?? (() => String(randomInt(100000, 1000000)));
  const activeCodes = new Set(
    [...deployments]
      .filter((deployment) => pairingIsActive(deployment, currentTime))
      .map((deployment) => deployment.pairingCode),
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pairingCode = generateCode();
    if (/^\d{6}$/.test(pairingCode) && !activeCodes.has(pairingCode)) {
      return {
        pairingCode,
        pairingExpiresAt: new Date(currentTime + ttlMs).toISOString(),
      };
    }
  }

  throw new Error('A unique deployment pairing code could not be generated.');
}

export function claimDeploymentPairing(
  deployment: PairableDeployment,
  deviceId: string,
  currentTime = Date.now(),
): PairableDeployment & { pairedDeviceId: string; pairedAt: string } {
  if (!deviceId.trim()) throw new Error('A stable deviceId is required.');
  if (!pairingIsActive(deployment, currentTime)) {
    throw new Error('The tutorial pairing code is invalid or expired.');
  }
  if (deployment.pairedDeviceId && deployment.pairedDeviceId !== deviceId) {
    throw new Error('This tutorial is already paired to another device.');
  }
  return {
    ...deployment,
    pairedDeviceId: deviceId,
    pairedAt: new Date(currentTime).toISOString(),
  };
}
