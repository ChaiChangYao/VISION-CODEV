import { AccessToken } from 'livekit-server-sdk';

export type LiveKitTokenRole = 'publisher' | 'viewer';

export type LiveKitTokenInput = {
  companyId: string;
  memberId: string;
  workflowId: string;
  sessionId: string;
  role: LiveKitTokenRole;
};

export async function issueLiveKitToken(input: LiveKitTokenInput): Promise<{
  token: string;
  roomName: string;
  serverUrl: string;
  expiresInSeconds: number;
}> {
  const serverUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!serverUrl || !apiKey || !apiSecret) {
    throw new Error('LiveKit server URL and credentials are required.');
  }

  const roomName = `company-${input.companyId}-workflow-${input.workflowId}`;
  const identity = `vision-codef:${input.role}:${input.companyId}:${input.memberId}:${input.sessionId}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: input.role === 'publisher' ? 'Vision Codef phone' : 'Vision Codef desktop monitor',
    ttl: '15m',
    attributes: {
      companyId: input.companyId,
      workflowId: input.workflowId,
      sessionId: input.sessionId,
      role: input.role,
    },
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: input.role === 'publisher',
    canSubscribe: input.role === 'viewer',
    canPublishData: input.role === 'publisher',
  });

  return { token: await token.toJwt(), roomName, serverUrl, expiresInSeconds: 900 };
}
