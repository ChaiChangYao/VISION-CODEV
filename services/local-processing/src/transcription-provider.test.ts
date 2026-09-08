import { describe, expect, it } from 'vitest';

import { transcriptForWindow, type TimestampedTranscript } from './transcription-provider.js';

describe('timestamped transcription', () => {
  it('selects only speech overlapping an evidence window', () => {
    const transcript: TimestampedTranscript = {
      text: 'first second third', status: 'completed', segments: [
        { startMs: 0, endMs: 900, text: 'first' },
        { startMs: 1000, endMs: 1900, text: 'second' },
        { startMs: 3000, endMs: 3900, text: 'third' },
      ],
    };
    expect(transcriptForWindow(transcript, 800, 2200)).toBe('first second');
  });
});
