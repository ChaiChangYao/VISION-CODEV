import type { VoiceEvent, VoiceState, ReducerResult } from './types.js';

const voiceTransitions: Record<VoiceState, Partial<Record<VoiceEvent['type'], VoiceState>>> = {
  closed: { OPEN: 'listening', FAIL: 'error' },
  listening: {
    CLOSE: 'closed',
    GUIDANCE_START: 'speaking',
    INTERRUPT: 'interrupted',
    MUTE: 'muted',
    FAIL: 'error',
  },
  speaking: {
    CLOSE: 'closed',
    GUIDANCE_END: 'listening',
    INTERRUPT: 'interrupted',
    MUTE: 'muted',
    FAIL: 'error',
  },
  interrupted: {
    ACKNOWLEDGE: 'listening',
    CLOSE: 'closed',
    MUTE: 'muted',
    FAIL: 'error',
  },
  muted: { UNMUTE: 'listening', CLOSE: 'closed', FAIL: 'error' },
  error: { OPEN: 'listening', CLOSE: 'closed' },
};

/**
 * Realtime voice orchestration state. It deliberately contains no model or
 * media payloads; guidance remains an approved procedure-engine decision.
 */
export function reduceVoiceState(state: VoiceState, event: VoiceEvent): ReducerResult<VoiceState> {
  const next = voiceTransitions[state][event.type];
  return next
    ? { state: next, accepted: true }
    : { state, accepted: false, error: `Voice cannot accept ${event.type} while ${state}.` };
}
