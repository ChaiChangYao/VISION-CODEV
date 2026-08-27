import { describe, expect, it } from 'vitest';
import { loadConfig, publicConfig } from './index.js';

const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  QDRANT_URL: 'http://localhost:6333',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'vision-codef',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret',
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'key',
  LIVEKIT_API_SECRET: 'secret',
  TEMPORAL_ADDRESS: 'localhost:7233',
  API_URL: 'http://localhost:4000',
  WEB_URL: 'http://localhost:3000',
};

describe('application config', () => {
  it('parses the local development configuration', () => {
    expect(loadConfig(validEnv)).toMatchObject(validEnv);
  });

  it('rejects missing secrets and endpoints', () => {
    expect(() => loadConfig({ ...validEnv, S3_SECRET_KEY: '' })).toThrow('S3_SECRET_KEY');
  });

  it('only exposes explicitly public settings', () => {
    expect(publicConfig(loadConfig(validEnv))).toEqual({
      NODE_ENV: 'test',
      API_URL: 'http://localhost:4000',
      WEB_URL: 'http://localhost:3000',
    });
  });
});
