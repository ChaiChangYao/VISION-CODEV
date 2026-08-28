import { describe, expect, it } from 'vitest';
import { authenticateRequest, createDevelopmentAuthToken, verifyAuthToken } from './auth.js';

const tenant = {
  companyId: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e22',
  memberId: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e23',
};

describe('request authentication', () => {
  it('verifies signed tenant claims and rejects tampering', () => {
    const token = createDevelopmentAuthToken(tenant, 'test-secret', 2_000);
    expect(verifyAuthToken(token, 'test-secret', 1_000)).toEqual(tenant);
    expect(() => verifyAuthToken(token.slice(0, -1) + '0', 'test-secret', 1_000)).toThrow('signature');
  });

  it('fails closed in production when no bearer principal is present', () => {
    expect(() => authenticateRequest({}, tenant, { NODE_ENV: 'production', VISION_CODEF_AUTH_SECRET: 'test-secret' })).toThrow('required in production');
  });

  it('allows the local header fallback only outside production', () => {
    expect(authenticateRequest({}, tenant, { NODE_ENV: 'development' })).toEqual(tenant);
  });
});
