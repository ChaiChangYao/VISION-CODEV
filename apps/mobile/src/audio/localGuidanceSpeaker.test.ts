import { describe, expect, it, vi } from 'vitest';

import { LocalGuidanceSpeaker, type StreamingGuidanceEngine } from './localGuidanceSpeaker';

function fakeEngine(): StreamingGuidanceEngine {
  return {
    getSampleRate: vi.fn().mockResolvedValue(16000),
    startPcmPlayer: vi.fn().mockResolvedValue(undefined),
    writePcmChunk: vi.fn().mockResolvedValue(undefined),
    stopPcmPlayer: vi.fn().mockResolvedValue(undefined),
    generateSpeechStream: vi.fn().mockImplementation(async (_text, _options, handlers) => {
      handlers.onChunk?.({ samples: [0.1, -0.1], sampleRate: 16000 });
      handlers.onEnd?.();
      return { cancel: vi.fn().mockResolvedValue(undefined) };
    }),
    cancelSpeechStream: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

describe('LocalGuidanceSpeaker', () => {
  it('streams local speech to a PCM player and releases it when the message ends', async () => {
    const engine = fakeEngine();
    let onChunk: ((chunk: { samples: number[]; sampleRate: number }) => void) | undefined;
    let onEnd: (() => void) | undefined;
    engine.generateSpeechStream = vi.fn().mockImplementation(async (_text, _options, handlers) => {
      onChunk = handlers.onChunk;
      onEnd = handlers.onEnd;
      return { cancel: vi.fn().mockResolvedValue(undefined) };
    });
    const speaker = new LocalGuidanceSpeaker(async () => engine);

    await speaker.speak('Stop and align the left corner.');
    onChunk?.({ samples: [0.1, -0.1], sampleRate: 16000 });
    onEnd?.();
    await vi.waitFor(() => expect(engine.stopPcmPlayer).toHaveBeenCalled());

    expect(engine.startPcmPlayer).toHaveBeenCalledWith(16000, 1);
    expect(engine.writePcmChunk).toHaveBeenCalledWith([0.1, -0.1]);
    expect(engine.stopPcmPlayer).toHaveBeenCalled();
    expect(speaker.isSpeaking()).toBe(false);
  });

  it('cancels active speech before a new instruction replaces it', async () => {
    const engine = fakeEngine();
    const speaker = new LocalGuidanceSpeaker(async () => engine);

    await speaker.speak('Continue.');
    await speaker.speak('Stop immediately.', { priority: 'urgent' });

    expect(engine.cancelSpeechStream).toHaveBeenCalled();
  });
});
