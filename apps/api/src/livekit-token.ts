import { AccessToken } from 'livekit-server-sdk';

/**
 * The phone sends capture media and receives a trusted guidance audio track.
 * The guidance role is for a realtime procedure service, not an end user.
 */
export type LiveKitTokenRole = 'publisher' | 'viewer' | 'guidance';

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
    name:
      input.role === 'publisher'
        ? 'Vision Codef phone'
        : input.role === 'guidance'
          ? 'Vision Codef guidance service'
          : 'Vision Codef desktop monitor',
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
    canPublish: input.role === 'publisher' || input.role === 'guidance',
    // The phone subscribes selectively in the client, only to `guidance`
    // audio, so the desktop monitor cannot accidentally be played on-device.
    canSubscribe: true,
    canPublishData: input.role === 'publisher' || input.role === 'guidance',
  });

  return { token: await token.toJwt(), roomName, serverUrl, expiresInSeconds: 900 };
}
