import { describe, expect, it } from 'vitest';

import {
  claimDeploymentPairing,
  createDeploymentPairing,
  pairingIsActive,
} from './deployment-pairing.js';

describe('deployment pairing', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');

  it('creates a unique six-digit code with a finite expiry', () => {
    const codes = ['123456', '654321'];
    const pairing = createDeploymentPairing(
      [{ pairingCode: '123456', pairingExpiresAt: new Date(now + 60_000).toISOString() }],
      { currentTime: now, generateCode: () => codes.shift()! },
    );
    expect(pairing).toEqual({
      pairingCode: '654321',
      pairingExpiresAt: '2026-09-12T12:10:00.000Z',
    });
  });

  it('accepts the same device idempotently and rejects a different device', () => {
    const deployment = {
      pairingCode: '123456',
      pairingExpiresAt: new Date(now + 60_000).toISOString(),
    };
    const claimed = claimDeploymentPairing(deployment, 'phone-1', now);
    expect(claimDeploymentPairing(claimed, 'phone-1', now).pairedDeviceId).toBe('phone-1');
    expect(() => claimDeploymentPairing(claimed, 'phone-2', now)).toThrow(
      'already paired to another device',
    );
  });

  it('rejects expired pairings', () => {
    const deployment = {
      pairingCode: '123456',
      pairingExpiresAt: new Date(now).toISOString(),
    };
    expect(pairingIsActive(deployment, now)).toBe(false);
    expect(() => claimDeploymentPairing(deployment, 'phone-1', now)).toThrow('invalid or expired');
  });
});
