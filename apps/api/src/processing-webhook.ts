import { createHmac, timingSafeEqual } from 'node:crypto';

export function signProcessingCompletion(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

export function verifyProcessingCompletionSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signProcessingCompletion(rawBody, secret), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
