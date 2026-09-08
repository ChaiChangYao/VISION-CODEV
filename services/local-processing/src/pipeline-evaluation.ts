export type TimestampedMoment = { startMs: number; keyframeMs: number; endMs: number };
export type ReviewedMomentMatch = { expectedIndex: number; predictedIndex: number; semanticCorrect: boolean };

export type TimestampedPipelineMetrics = {
  eventPrecision: number;
  eventRecall: number;
  semanticStepAccuracy: number;
  meanKeyframeErrorMs?: number;
  matchedMoments: number;
};

/** Computes reportable metrics only from explicit human-reviewed correspondences. */
export function evaluateTimestampedPipeline(
  expected: readonly TimestampedMoment[],
  predicted: readonly TimestampedMoment[],
  reviewedMatches: readonly ReviewedMomentMatch[],
): TimestampedPipelineMetrics {
  const valid = reviewedMatches.filter((match) => expected[match.expectedIndex] && predicted[match.predictedIndex]);
  if (new Set(valid.map((match) => match.expectedIndex)).size !== valid.length || new Set(valid.map((match) => match.predictedIndex)).size !== valid.length) {
    throw new Error('Each expected and predicted moment may be matched at most once.');
  }
  const errors = valid.map((match) => Math.abs(expected[match.expectedIndex]!.keyframeMs - predicted[match.predictedIndex]!.keyframeMs));
  return {
    eventPrecision: predicted.length ? valid.length / predicted.length : 0,
    eventRecall: expected.length ? valid.length / expected.length : 0,
    semanticStepAccuracy: valid.length ? valid.filter((match) => match.semanticCorrect).length / valid.length : 0,
    meanKeyframeErrorMs: errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : undefined,
    matchedMoments: valid.length,
  };
}
