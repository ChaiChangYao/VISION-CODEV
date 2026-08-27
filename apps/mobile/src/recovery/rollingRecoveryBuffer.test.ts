import { describe, expect, it } from 'vitest';

import { RollingRecoveryBuffer } from './rollingRecoveryBuffer';
import type { RecoverySegment } from '../types';

function segment(sequence: number, start: number, end: number, byteLength = 2): RecoverySegment {
  return {
    id: `segment-${sequence}`,
    sessionId: 'session-1',
    sequence,
    startedAtMs: start,
    endedAtMs: end,
    mimeType: 'video/mp4',
    byteLength,
    sha256: `hash-${sequence}`,
    localUri: `file:///segment-${sequence}`,
  };
}

describe('rolling recovery buffer', () => {
  it('bounds duration and returns data only for an explicit Egress gap request', async () => {
    const buffer = new RollingRecoveryBuffer({ maxDurationMs: 3_000, maxBytes: 100 });
    await buffer.append(segment(1, 0, 1_000), new Uint8Array([1, 1]));
    await buffer.append(segment(2, 1_000, 2_000), new Uint8Array([2, 2]));
    await buffer.append(segment(3, 2_000, 3_000), new Uint8Array([3, 3]));
    await buffer.append(segment(4, 3_000, 4_000), new Uint8Array([4, 4]));

    expect(buffer.list().map((item) => item.sequence)).toEqual([1, 2, 3, 4]);
    expect((await buffer.drainForRequest({
      sessionId: 'session-1',
      missingFromMs: 1_500,
      missingToMs: 2_500,
      requestedAt: '2026-01-01T00:00:00.000Z',
      reason: 'egress_gap',
    })).map((item) => item.segment.sequence)).toEqual([2, 3]);
  });

  it('evicts oldest data when byte budget is exceeded', async () => {
    const buffer = new RollingRecoveryBuffer({ maxDurationMs: 30_000, maxBytes: 4 });
    await buffer.append(segment(1, 0, 100, 3), new Uint8Array([1, 1, 1]));
    await buffer.append(segment(2, 100, 200, 3), new Uint8Array([2, 2, 2]));
    expect(buffer.list().map((item) => item.sequence)).toEqual([2]);
  });

  it('removes reconciled segments only after acknowledgement', async () => {
    const buffer = new RollingRecoveryBuffer();
    await buffer.append(segment(1, 0, 100), new Uint8Array([1, 1]));
    expect(buffer.list()).toHaveLength(1);
    await buffer.acknowledgeReconciled(['segment-1']);
    expect(buffer.list()).toHaveLength(0);
  });
});
