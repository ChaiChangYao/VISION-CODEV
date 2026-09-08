import { describe, expect, it } from 'vitest';

import { verifyGuidanceServiceBearer } from './guidance-auth.js';

describe('guidance service authentication', () => {
  it('accepts only the configured bearer secret', () => {
    expect(verifyGuidanceServiceBearer('Bearer service-secret', 'service-secret')).toBe(true);
    expect(verifyGuidanceServiceBearer('Bearer wrong-secret', 'service-secret')).toBe(false);
    expect(verifyGuidanceServiceBearer(undefined, 'service-secret')).toBe(false);
    expect(verifyGuidanceServiceBearer('Bearer service-secret', undefined)).toBe(false);
  });
});
