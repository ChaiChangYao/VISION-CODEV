import { timingSafeEqual } from 'node:crypto';

export function verifyGuidanceServiceBearer(
  authorization: string | string[] | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return false;
  }

  const supplied = Buffer.from(authorization.slice('Bearer '.length).trim(), 'utf8');
  const expected = Buffer.from(expectedSecret, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
