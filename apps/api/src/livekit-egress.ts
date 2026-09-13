import { EncodedFileOutput, EgressClient, S3Upload } from 'livekit-server-sdk';
import { liveKitRoomName } from './livekit-token.js';

export type CanonicalEgressConfig = {
  host: string;
  apiKey: string;
  apiSecret: string;
  bucket: string;
  accessKey: string;
  secret: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
};

export type CanonicalEgressHandle = { egressId: string; objectKey: string };

function httpHost(value: string): string {
  return value.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

export function getCanonicalEgressConfig(env: NodeJS.ProcessEnv = process.env): CanonicalEgressConfig | undefined {
  const host = env.LIVEKIT_EGRESS_URL ?? env.LIVEKIT_URL;
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const bucket = env.LIVEKIT_EGRESS_S3_BUCKET;
  const accessKey = env.LIVEKIT_EGRESS_S3_ACCESS_KEY;
  const secret = env.LIVEKIT_EGRESS_S3_SECRET;
  const region = env.LIVEKIT_EGRESS_S3_REGION;
  if (!host || !apiKey || !apiSecret || !bucket || !accessKey || !secret || !region) return undefined;
  return {
    host: httpHost(host),
    apiKey,
    apiSecret,
    bucket,
    accessKey,
    secret,
    region,
    endpoint: env.LIVEKIT_EGRESS_S3_ENDPOINT,
    forcePathStyle: env.LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE === 'true',
  };
}

export function canonicalObjectKey(companyId: string, sessionId: string): string {
  return `companies/${companyId}/captures/${sessionId}/egress.mp4`;
}

export async function startCanonicalEgress(input: {
  companyId: string;
  workflowId: string;
  sessionId: string;
}): Promise<CanonicalEgressHandle> {
  const config = getCanonicalEgressConfig();
  if (!config) throw new Error('Canonical LiveKit Egress storage is not configured.');
  const objectKey = canonicalObjectKey(input.companyId, input.sessionId);
  const output = new EncodedFileOutput({
    filepath: objectKey,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: config.accessKey,
        secret: config.secret,
        region: config.region,
        bucket: config.bucket,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
      }),
    },
  });
  const client = new EgressClient(config.host, config.apiKey, config.apiSecret);
  const info = await client.startRoomCompositeEgress(
    liveKitRoomName(input),
    output,
    { layout: 'grid' },
  );
  return { egressId: info.egressId, objectKey };
}

export async function stopCanonicalEgress(egressId: string): Promise<void> {
  const config = getCanonicalEgressConfig();
  if (!config) throw new Error('Canonical LiveKit Egress storage is not configured.');
  await new EgressClient(config.host, config.apiKey, config.apiSecret).stopEgress(egressId);
}
