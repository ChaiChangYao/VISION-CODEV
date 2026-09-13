import { describe, expect, it, vi } from 'vitest';

import { LocalGuidanceSpeaker, type LocalGuidanceEngine } from './localGuidanceSpeaker';

function fakeEngine(): LocalGuidanceEngine {
  return {
    generateSpeech: vi.fn().mockResolvedValue({ samples: [0.1, -0.1], sampleRate: 16_000 }),
    startPcmPlayer: vi.fn().mockResolvedValue(undefined),
    writePcmChunk: vi.fn().mockResolvedValue(undefined),
    stopPcmPlayer: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

describe('LocalGuidanceSpeaker', () => {
  it('generates speech locally, plays it, and releases the PCM player', async () => {
    vi.useFakeTimers();
    const engine = fakeEngine();
    const speaker = new LocalGuidanceSpeaker(async () => engine);

    const speech = speaker.speak('Stop and align the left corner.');
    await vi.advanceTimersByTimeAsync(100);
    await speech;

    expect(engine.generateSpeech).toHaveBeenCalledWith(
      'Stop and align the left corner.',
      { speed: undefined },
    );
    expect(engine.startPcmPlayer).toHaveBeenCalledWith(16_000, 1);
    expect(engine.writePcmChunk).toHaveBeenCalledWith([0.1, -0.1]);
    expect(engine.stopPcmPlayer).toHaveBeenCalled();
    expect(speaker.isSpeaking()).toBe(false);
    vi.useRealTimers();
  });

  it('interrupts active playback before a new instruction replaces it', async () => {
    vi.useFakeTimers();
    const engine = fakeEngine();
    engine.generateSpeech = vi.fn().mockResolvedValue({
      samples: Array.from({ length: 16_000 }, () => 0.1),
      sampleRate: 16_000,
    });
    const speaker = new LocalGuidanceSpeaker(async () => engine);

    const first = speaker.speak('Continue.');
    await vi.advanceTimersByTimeAsync(1);
    const second = speaker.speak('Stop immediately.', { priority: 'urgent' });
    await vi.advanceTimersByTimeAsync(1_200);
    await Promise.all([first, second]);

    expect(engine.stopPcmPlayer).toHaveBeenCalled();
    expect(engine.generateSpeech).toHaveBeenLastCalledWith('Stop immediately.', { speed: undefined });
    vi.useRealTimers();
  });

  it('drops synthesized audio when a newer instruction arrives during generation', async () => {
    vi.useFakeTimers();
    const engine = fakeEngine();
    let releaseFirst!: () => void;
    engine.generateSpeech = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        releaseFirst = () => resolve({ samples: [0.1], sampleRate: 16_000 });
      }))
      .mockResolvedValueOnce({ samples: [0.2], sampleRate: 16_000 });
    const speaker = new LocalGuidanceSpeaker(async () => engine);

    const first = speaker.speak('Old instruction.');
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.generateSpeech).toHaveBeenCalledTimes(1);
    const second = speaker.speak('New instruction.');
    releaseFirst();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first, second]);

    expect(engine.writePcmChunk).toHaveBeenCalledTimes(1);
    expect(engine.writePcmChunk).toHaveBeenCalledWith([0.2]);
    vi.useRealTimers();
  });
});
