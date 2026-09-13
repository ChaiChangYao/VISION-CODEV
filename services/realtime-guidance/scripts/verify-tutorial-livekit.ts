import { randomUUID } from 'node:crypto';
import { Room, RoomEvent } from '@livekit/rtc-node';
import { config as loadEnv } from 'dotenv';

import { GuidanceApiClient } from '../src/apiClient.js';
import { GUIDANCE_DATA_TOPIC, LiveKitGuidanceTransport } from '../src/livekitTransport.js';

loadEnv({ path: new URL('../../../.env', import.meta.url) });

const apiBaseUrl = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const companyId = process.env.NEXT_PUBLIC_COMPANY_ID ?? process.env.EXPO_PUBLIC_COMPANY_ID ?? '00000000-0000-7000-8000-000000000001';
const memberId = process.env.NEXT_PUBLIC_MEMBER_ID ?? process.env.EXPO_PUBLIC_MEMBER_ID ?? '00000000-0000-4000-8000-000000000002';
const workflowId = process.argv[2] ?? required('VISION_CODEF_WORKFLOW_ID');
const deviceId = `tutorial-smoke-${randomUUID()}`;
const headers = {
  'content-type': 'application/json',
  'x-company-id': companyId,
  'x-member-id': memberId,
};

const publisher = new Room();
let guidance: LiveKitGuidanceTransport | undefined;

try {
  const deployment = await post<{ id: string; pairingCode: string }>(
    `/v1/workflows/${workflowId}/deployments`,
    {},
  );
  const pairing = await post<{ deploymentId: string; workflowId: string; roomName: string }>(
    '/v1/deployment-pairings/claim',
    { pairingCode: deployment.pairingCode, deviceId },
  );
  const publisherToken = await post<{ token: string; serverUrl: string; roomName: string }>(
    '/v1/deployment-token',
    { deploymentId: deployment.id, workflowId, memberId, deviceId },
  );
  const api = new GuidanceApiClient(
    apiBaseUrl,
    { companyId, memberId, workflowId, deploymentId: deployment.id },
    required('VISION_CODEF_GUIDANCE_SERVICE_SECRET'),
  );
  const connection = await api.connection();

  if (pairing.roomName !== publisherToken.roomName || connection.roomName !== publisherToken.roomName) {
    throw new Error('Tutorial participants were issued inconsistent room names.');
  }

  guidance = new LiveKitGuidanceTransport();
  await guidance.start(connection, () => undefined);

  const received = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for initial tutorial guidance.')), 10_000);
    publisher.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (participant?.attributes.role !== 'guidance' || topic !== GUIDANCE_DATA_TOPIC) return;
      const message = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; text?: string };
      if (message.type !== 'speak' || !message.text) return;
      clearTimeout(timer);
      resolve(message.text);
    });
  });

  await publisher.connect(publisherToken.serverUrl, publisherToken.token, { autoSubscribe: false });
  await guidance.publish({ type: 'speak', text: connection.currentInstruction, priority: 'normal' });
  const text = await received;
  if (text !== connection.currentInstruction) throw new Error('The received instruction did not match the published workflow.');

  console.log(JSON.stringify({
    status: 'ok',
    deploymentIsolated: publisherToken.roomName.endsWith(`-session-${deployment.id}`),
    trustedGuidanceReceived: true,
    instructionMatched: true,
  }));
} finally {
  await publisher.disconnect();
  await guidance?.stop();
}

// The rtc-node native runtime retains background handles after disconnect on
// Windows. This is a bounded smoke command, so exit once cleanup completes.
process.exit(0);

async function post<T>(path: string, value: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(value),
  });
  const envelope = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? `${path} failed (${response.status}).`);
  return envelope.data;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
