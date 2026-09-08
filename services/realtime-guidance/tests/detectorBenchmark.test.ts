import { describe, expect, it } from 'vitest';

import type { ChangeDetector } from '../src/changeDetection.js';
import type { FrameSample } from '../src/contracts.js';
import { benchmarkDetectors } from '../src/detectorBenchmark.js';

const frames: FrameSample[] = [0, 1000, 2000].map((timestampMs) => ({
  data: new Uint8Array([0, 0, 0, 255]),
  width: 1,
  height: 1,
  pixelFormat: 'rgba',
  timestampMs,
  participantIdentity: 'phone',
}));

function detector(id: string, triggers: number[]): ChangeDetector {
  return {
    id,
    version: '1',
    reset: async () => undefined,
    observe: async (frame) => ({
      detectorId: id,
      detectorVersion: '1',
      timestampMs: frame.timestampMs,
      score: triggers.includes(frame.timestampMs) ? 1 : 0,
      changed: triggers.includes(frame.timestampMs),
      latencyMs: id === 'fast' ? 2 : 10,
    }),
  };
}

describe('benchmarkDetectors', () => {
  it('compares latency and labelled transition quality on the same frames', async () => {
    const reports = await benchmarkDetectors(
      [detector('fast', [1000]), detector('noisy', [0, 1000])],
      frames,
      { referenceTransitionsMs: [1000], matchToleranceMs: 100 },
    );

    expect(reports[0]).toMatchObject({
      detectorId: 'fast',
      triggerCount: 1,
      averageLatencyMs: 2,
      precision: 1,
      recall: 1,
      f1: 1,
    });
    expect(reports[1]?.precision).toBe(0.5);
  });
});
