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
    expect(result.roomName).toBe('company-00000000-0000-7000-8000-000000000001-workflow-00000000-0000-7000-8000-000000000003-session-00000000-0000-7000-8000-000000000004');
    expect(result.serverUrl).toBe('ws://livekit.test');
    expect(result.expiresInSeconds).toBe(900);
    expect(jwtPayload(result.token).video).toMatchObject({ canPublish: true, canSubscribe: true });
  });

  it('issues a video-subscribe and data-publish token for the realtime guidance service', async () => {
    process.env.LIVEKIT_URL = 'ws://livekit.test';
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret';

    const result = await issueLiveKitToken({
      companyId: '00000000-0000-7000-8000-000000000001',
      memberId: '00000000-0000-4000-8000-000000000002',
      workflowId: '00000000-0000-7000-8000-000000000003',
      sessionId: '00000000-0000-7000-8000-000000000004',
      role: 'guidance',
    });

    expect(jwtPayload(result.token).video).toMatchObject({
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
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

function jwtPayload(token: string): Record<string, unknown> {
  const encoded = token.split('.')[1];
  if (!encoded) throw new Error('JWT payload is missing.');
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
}
