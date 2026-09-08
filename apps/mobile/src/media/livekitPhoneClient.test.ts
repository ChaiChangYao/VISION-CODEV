import { describe, expect, it } from 'vitest';
import { Track } from 'livekit-client';

import {
  isGuidanceAudioPublication,
  isGuidanceAudioTrack,
  isGuidanceParticipant,
  parseGuidanceMessage,
} from './livekitPhoneClient';

describe('LiveKit guidance audio selection', () => {
  it('accepts audio only from the realtime guidance participant', () => {
    const guidance = { attributes: { role: 'guidance' } };
    const audio = { kind: Track.Kind.Audio };

    expect(isGuidanceParticipant(guidance)).toBe(true);
    expect(isGuidanceAudioPublication(audio, guidance)).toBe(true);
    expect(isGuidanceAudioTrack(audio, audio, guidance)).toBe(true);
  });

  it('rejects desktop and video publications', () => {
    expect(
      isGuidanceAudioPublication(
        { kind: Track.Kind.Audio },
        { attributes: { role: 'viewer' } },
      ),
    ).toBe(false);
    expect(
      isGuidanceAudioPublication(
        { kind: Track.Kind.Video },
        { attributes: { role: 'guidance' } },
      ),
    ).toBe(false);
  });
});

describe('LiveKit guidance data contract', () => {
  it('accepts a bounded speak request and an interrupt request', () => {
    expect(parseGuidanceMessage(new TextEncoder().encode('{"type":"speak","text":"Stop now.","priority":"urgent"}'))).toEqual({
      type: 'speak',
      text: 'Stop now.',
      priority: 'urgent',
    });
    expect(parseGuidanceMessage(new TextEncoder().encode('{"type":"interrupt"}'))).toEqual({ type: 'interrupt' });
  });

  it('rejects malformed or untrusted-message shapes', () => {
    expect(parseGuidanceMessage(new TextEncoder().encode('{"type":"speak","text":""}'))).toBeUndefined();
    expect(parseGuidanceMessage(new TextEncoder().encode('not-json'))).toBeUndefined();
  });
});
