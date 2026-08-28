import { describe, expect, it } from 'vitest';
import { generateUuidV7 } from './ids.js';

describe('UUIDv7 identifiers', () => {
  it('encodes the timestamp, version, and RFC 9562 variant', () => {
    const value = generateUuidV7(new Date('2026-01-02T03:04:05.006Z'));
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('keeps timestamp ordering in the sortable prefix', () => {
    const earlier = generateUuidV7(new Date('2026-01-02T03:04:05.006Z'));
    const later = generateUuidV7(new Date('2026-01-02T03:04:05.007Z'));
    expect(earlier.slice(0, 13) < later.slice(0, 13)).toBe(true);
  });
});
