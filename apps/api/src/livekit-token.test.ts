import { afterEach, describe, expect, it } from 'vitest';
import { issueLiveKitToken } from './livekit-token.js';

const previous = {
  url: process.env.LIVEKIT_URL,
  key: process.env.LIVEKIT_API_KEY,
  secret: process.env.LIVEKIT_API_SECRET,
};

afterEach(() => {
  process.env.LIVEKIT_URL = previous.url;
  process.env.LIVEKIT_API_KEY = previous.key;
  process.env.LIVEKIT_API_SECRET = previous.secret;
});

describe('issueLiveKitToken', () => {
  it('issues a company-scoped publisher token with the workflow room', async () => {
    process.env.LIVEKIT_URL = 'ws://livekit.test';
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret';

    const result = await issueLiveKitToken({
      companyId: '00000000-0000-7000-8000-000000000001',
      memberId: '00000000-0000-4000-8000-000000000002',
      workflowId: '00000000-0000-7000-8000-000000000003',
      sessionId: '00000000-0000-7000-8000-000000000004',
      role: 'publisher',
    });

    expect(result.token.length).toBeGreaterThan(20);
    expect(result.roomName).toBe('company-00000000-0000-7000-8000-000000000001-workflow-00000000-0000-7000-8000-000000000003');
    expect(result.serverUrl).toBe('ws://livekit.test');
    expect(result.expiresInSeconds).toBe(900);
  });

  it('fails closed when server credentials are missing', async () => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;

    await expect(issueLiveKitToken({
      companyId: '00000000-0000-7000-8000-000000000001',
      memberId: '00000000-0000-4000-8000-000000000002',
      workflowId: '00000000-0000-7000-8000-000000000003',
      sessionId: '00000000-0000-7000-8000-000000000004',
      role: 'viewer',
    })).rejects.toThrow('LiveKit server URL and credentials are required.');
  });
});
