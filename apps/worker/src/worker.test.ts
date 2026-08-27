import { describe, expect, it } from 'vitest';

import { validateJobRequest } from './worker';

describe('durable job boundary', () => {
  it('requires tenant and idempotency context', () => {
    expect(validateJobRequest({ job: 'capture.finalize', companyId: 'company-1', resourceId: 'capture-1', idempotencyKey: 'request-1' })).toMatchObject({ companyId: 'company-1' });
    expect(() => validateJobRequest({ job: 'capture.finalize', companyId: '', resourceId: 'capture-1', idempotencyKey: 'request-1' })).toThrow();
  });
});

