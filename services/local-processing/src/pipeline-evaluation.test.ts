import { describe, expect, it } from 'vitest';

import { evaluateTimestampedPipeline } from './pipeline-evaluation.js';

describe('timestamped pipeline evaluation', () => {
  it('reports detection, semantic, and temporal accuracy from reviewed matches', () => {
    const expected = [
      { startMs: 0, keyframeMs: 1000, endMs: 2000 },
      { startMs: 2000, keyframeMs: 3000, endMs: 4000 },
    ];
    const predicted = [
      { startMs: 0, keyframeMs: 1100, endMs: 2000 },
      { startMs: 2000, keyframeMs: 3300, endMs: 4000 },
      { startMs: 4000, keyframeMs: 5000, endMs: 6000 },
    ];
    expect(evaluateTimestampedPipeline(expected, predicted, [
      { expectedIndex: 0, predictedIndex: 0, semanticCorrect: true },
      { expectedIndex: 1, predictedIndex: 1, semanticCorrect: false },
    ])).toEqual({ eventPrecision: 2 / 3, eventRecall: 1, semanticStepAccuracy: 0.5, meanKeyframeErrorMs: 200, matchedMoments: 2 });
  });
});
