import { describe, expect, it } from 'vitest';

import { FrameDifferenceDetector } from '../src/changeDetection.js';
import type { FrameSample } from '../src/contracts.js';

function solidFrame(value: number, timestampMs: number): FrameSample {
  return {
    data: new Uint8Array([value, value, value, 255]),
    width: 1,
    height: 1,
    pixelFormat: 'rgba',
    timestampMs,
    participantIdentity: 'phone',
  };
}

describe('FrameDifferenceDetector', () => {
  it('establishes a baseline and triggers after a sustained visual change', async () => {
    const detector = new FrameDifferenceDetector({
      threshold: 0.2,
      consecutiveFrames: 2,
      smoothing: 1,
    });

    expect((await detector.observe(solidFrame(0, 0))).changed).toBe(false);
    expect((await detector.observe(solidFrame(255, 500))).changed).toBe(false);
    const trigger = await detector.observe(solidFrame(0, 1000));

    expect(trigger.changed).toBe(true);
    expect(trigger.score).toBe(1);
    expect(trigger.detectorId).toBe('frame-difference');
  });

  it('clears temporal state when reset', async () => {
    const detector = new FrameDifferenceDetector({ threshold: 0.2, consecutiveFrames: 1 });
    await detector.observe(solidFrame(0, 0));
    expect((await detector.observe(solidFrame(255, 500))).changed).toBe(true);
    await detector.reset();
    expect((await detector.observe(solidFrame(255, 1000))).changed).toBe(false);
  });
});
