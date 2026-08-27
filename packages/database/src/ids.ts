import { randomBytes } from 'node:crypto';

export function generateUuidV7(now = new Date()): string {
  const timestampMs = BigInt(now.getTime());
  const bytes = randomBytes(16);
  bytes[0] = Number((timestampMs >> 40n) & 255n);
  bytes[1] = Number((timestampMs >> 32n) & 255n);
  bytes[2] = Number((timestampMs >> 24n) & 255n);
  bytes[3] = Number((timestampMs >> 16n) & 255n);
  bytes[4] = Number((timestampMs >> 8n) & 255n);
  bytes[5] = Number(timestampMs & 255n);
  bytes[6] = (bytes[6]! & 15) | 112;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
