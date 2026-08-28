import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { TenantContextSchema, type TenantContext } from '@vision-codef/contracts';

type AuthClaims = TenantContext & { exp: number };

function header(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.authorization;
  if (Array.isArray(value)) throw new Error('Authorization must be supplied exactly once.');
  return value;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signature(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input, 'utf8').digest('hex');
}

export function createDevelopmentAuthToken(input: TenantContext, secret: string, expiresAt = Date.now() + 15 * 60 * 1000): string {
  const claims: AuthClaims = { ...TenantContextSchema.parse(input), exp: expiresAt };
  const encoded = encode(claims);
  const unsigned = 'vc1.' + encoded;
  return unsigned + '.' + signature(unsigned, secret);
}

export function verifyAuthToken(token: string, secret: string, now = Date.now()): TenantContext {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'vc1' || !parts[1] || !parts[2]) throw new Error('The bearer token format is invalid.');
  const unsigned = parts[0] + '.' + parts[1];
  const expected = Buffer.from(signature(unsigned, secret), 'utf8');
  const actual = Buffer.from(parts[2], 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('The bearer token signature is invalid.');
  let claims: AuthClaims;
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as AuthClaims; } catch { throw new Error('The bearer token claims are invalid.'); }
  const tenant = TenantContextSchema.parse(claims);
  if (!Number.isFinite(claims.exp) || claims.exp <= now) throw new Error('The bearer token has expired.');
  return tenant;
}

export function authenticateRequest(headers: IncomingHttpHeaders, headerTenant: TenantContext, env: NodeJS.ProcessEnv = process.env): TenantContext {
  const authorization = header(headers);
  if (!authorization) {
    if (env.NODE_ENV === 'production') throw new Error('A bearer token is required in production.');
    return headerTenant;
  }
  const secret = env.VISION_CODEF_AUTH_SECRET;
  if (!secret) throw new Error('Bearer-token verification is not configured.');
  if (!authorization.startsWith('Bearer ')) throw new Error('Authorization must use the Bearer scheme.');
  const principal = verifyAuthToken(authorization.slice('Bearer '.length).trim(), secret);
  if (principal.companyId !== headerTenant.companyId || principal.memberId !== headerTenant.memberId) throw new Error('Bearer tenant claims do not match request tenant context.');
  return principal;
}
