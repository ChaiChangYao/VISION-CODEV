import { describe, expect, it } from 'vitest';
import { canonicalObjectKey, getCanonicalEgressConfig } from './livekit-egress.js';

describe('canonical LiveKit Egress configuration', () => {
  it('fails closed when S3 output configuration is incomplete', () => {
    expect(getCanonicalEgressConfig({ LIVEKIT_URL: 'wss://livekit.example', LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret' })).toBeUndefined();
  });

  it('normalizes the LiveKit host and preserves immutable company object paths', () => {
    const config = getCanonicalEgressConfig({
      LIVEKIT_URL: 'wss://livekit.example',
      LIVEKIT_API_KEY: 'key',
      LIVEKIT_API_SECRET: 'secret',
      LIVEKIT_EGRESS_S3_BUCKET: 'captures',
      LIVEKIT_EGRESS_S3_ACCESS_KEY: 'access',
      LIVEKIT_EGRESS_S3_SECRET: 's3-secret',
      LIVEKIT_EGRESS_S3_REGION: 'auto',
      LIVEKIT_EGRESS_S3_ENDPOINT: 'http://minio:9000',
      LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE: 'true',
    });
    expect(config).toMatchObject({ host: 'https://livekit.example', bucket: 'captures', forcePathStyle: true });
    expect(canonicalObjectKey('00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000002')).toBe('companies/00000000-0000-7000-8000-000000000001/captures/00000000-0000-7000-8000-000000000002/egress.mp4');
  });
});
