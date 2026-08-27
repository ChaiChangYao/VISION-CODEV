import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),
  REDIS_URL: z.string().url().or(z.string().startsWith('redis://')),
  QDRANT_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  LIVEKIT_URL: z.string().min(1),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  TEMPORAL_ADDRESS: z.string().min(1).default('localhost:7233'),
  API_URL: z.string().url(),
  WEB_URL: z.string().url(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid application configuration: ${details}`);
  }
  return result.data;
}

export function loadConfigIfPresent(env: NodeJS.ProcessEnv = process.env): AppConfig | undefined {
  if (!env.DATABASE_URL) return undefined;
  return loadConfig(env);
}

export function publicConfig(config: AppConfig): Pick<AppConfig, 'NODE_ENV' | 'API_URL' | 'WEB_URL'> {
  return { NODE_ENV: config.NODE_ENV, API_URL: config.API_URL, WEB_URL: config.WEB_URL };
}
