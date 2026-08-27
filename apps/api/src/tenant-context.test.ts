import { describe, expect, it } from 'vitest';
import { parseTenantContext, TenantContextError } from './tenant-context.js';

const companyId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e22';
const memberId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e23';

describe('parseTenantContext', () => {
  it('returns the company and member IDs from a valid request context', () => {
    expect(parseTenantContext({ 'x-company-id': companyId, 'x-member-id': memberId })).toEqual({ companyId, memberId });
  });

  it('rejects a request with missing context as unauthenticated', () => {
    expect(() => parseTenantContext({ 'x-company-id': companyId })).toThrowError(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }),
    );
  });

  it('rejects malformed UUID context as a validation error', () => {
    expect(() => parseTenantContext({ 'x-company-id': 'not-a-uuid', 'x-member-id': memberId })).toThrowError(
      expect.objectContaining({ status: 400, code: 'VALIDATION_FAILED' }),
    );
  });

  it('rejects duplicate header values instead of choosing one', () => {
    let thrown: unknown;
    try {
      parseTenantContext({ 'x-company-id': [companyId, companyId], 'x-member-id': memberId });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TenantContextError);
    expect(thrown).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  it('rejects blank headers as missing context', () => {
    expect(() => parseTenantContext({ 'x-company-id': '  ', 'x-member-id': memberId })).toThrowError(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }),
    );
  });
});
