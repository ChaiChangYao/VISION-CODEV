import { describe, expect, it } from 'vitest';
import { evaluatePaperCraneObservation } from './paper-crane.js';

const corners = [
  { x: 0, y: 0 },
  { x: 100, y: 2 },
  { x: 98, y: 100 },
  { x: 2, y: 98 },
];

const observation = (timestampMs: number, foldState: string, overrides: Record<string, unknown> = {}) => ({
  timestampMs,
  corners,
  foldState,
  visibilityScore: 0.95,
  alignmentScore: 0.95,
  handOccluded: false,
  ...overrides,
});

describe('paper-crane API observation boundary', () => {
  it('waits for persistence and then returns an interrupt with only the approved recovery', () => {
    const first = evaluatePaperCraneObservation(undefined, observation(0, 'diagonal-left'));
    const second = evaluatePaperCraneObservation(first.state, observation(800, 'diagonal-left'));

    expect(first.decision.type).toBe('WAIT');
    expect(second.decision.type).toBe('INTERRUPT');
    if (second.decision.type === 'INTERRUPT') {
      expect(second.decision.recovery.approved).toBe(true);
      expect(second.decision.recovery.provenance).toBe('PUBLISHED_REQUIREMENT');
    }
  });

  it('requests visibility instead of inventing a wrong fold under occlusion', () => {
    const result = evaluatePaperCraneObservation(undefined, observation(0, 'diagonal-left', {
      visibilityScore: 0.4,
      handOccluded: true,
    }));

    expect(result.decision.type).toBe('REQUEST_VISIBILITY');
    expect(result.state.status).toBe('uncertain');
  });
});
