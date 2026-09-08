import { describe, expect, it } from 'vitest';

import { decodeLumaFrames, detectChangeEvents } from './video-events.js';

describe('recorded video change detection', () => {
  it('collapses adjacent changed frames into timestamped evidence windows', () => {
    const still = new Uint8Array(16).fill(10);
    const changed = new Uint8Array(16).fill(220);
    const frames = [still, still, changed, changed, still, still].map((pixels, index) => ({
      timestampMs: index * 500,
      pixels,
    }));
    const events = detectChangeEvents(frames, 2500, { minimumScore: 0.1 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ startMs: 0, keyframeMs: 1000, endMs: 2500 });
  });

  it('decodes fixed-size grayscale frames with stable timestamps', () => {
    const frames = decodeLumaFrames(new Uint8Array(12), 2, 2, 2);
    expect(frames.map((frame) => frame.timestampMs)).toEqual([0, 500, 1000]);
    expect(frames.every((frame) => frame.pixels.length === 4)).toBe(true);
  });
});
