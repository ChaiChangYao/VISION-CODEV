import { describe, expect, it } from 'vitest';
import { createMembershipDirectory } from './membership.js';

const companyId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e22';
const memberId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e23';

describe('membership directory', () => {
  it('requires an explicitly configured company/member pair in production', () => {
    const directory = createMembershipDirectory({ NODE_ENV: 'production', VISION_CODEF_ALLOWED_MEMBERS: `${companyId}/${memberId}` });
    expect(directory.has({ companyId, memberId })).toBe(true);
    expect(directory.has({ companyId, memberId: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e24' })).toBe(false);
  });

  it('does not permit malformed allow-list entries', () => {
    const directory = createMembershipDirectory({ NODE_ENV: 'production', VISION_CODEF_ALLOWED_MEMBERS: 'not-a-membership' });
    expect(directory.has({ companyId, memberId })).toBe(false);
  });
});
