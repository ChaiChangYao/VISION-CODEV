import type { DatasetReadiness, PaperCraneFixtureResult, PaperCraneMetricReport } from './types.js';

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile95(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

export function isDatasetReadyForAccuracyClaim(dataset: DatasetReadiness): boolean {
  return (
    dataset.approvedGoldenRun &&
    dataset.correctRecordings >= dataset.requiredCorrectRecordings &&
    Object.values(dataset.deviationRecordingsByType).every(
      (count) => count >= dataset.requiredDeviationRecordingsPerType,
    ) &&
    dataset.portraitAndLandscape &&
    dataset.variedLighting &&
    dataset.occlusionCases &&
    dataset.annotations &&
    dataset.participantDisjoint &&
    dataset.frozenAcceptanceSet
  );
}

export function buildPaperCraneMetricReport(
  results: readonly PaperCraneFixtureResult[],
  dataset: DatasetReadiness,
): PaperCraneMetricReport {
  const correct = results.filter(
    (result) =>
      result.scenario === 'correct-transition' || result.scenario === 'delayed-but-correct',
  );
  const wrong = results.filter((result) => result.scenario === 'wrong-fold');
  const interrupts = results.filter((result) => result.actual === 'INTERRUPT');
  const occluded = results.filter((result) => result.scenario === 'occluded-uncertain');
  const recovery = results.filter((result) => result.scenario === 'approved-recovery');
  const latency = results.flatMap((result) =>
    result.interventionLatencyMs === undefined ? [] : [result.interventionLatencyMs],
  );
  const ready = isDatasetReadyForAccuracyClaim(dataset);
  const replayResults = results.filter((result) => result.scenario === 'induction-replay');
  const whyResults = results.filter((result) => result.whyResponseProvenanceLinked !== undefined);

  return {
    datasetReadyForAccuracyClaim: ready,
    results: [...results],
    metrics: {
      correctStepRecognition: rate(
        correct.filter((result) => result.passed).length,
        correct.length,
      ),
      selectedWrongFoldRecall: rate(wrong.filter((result) => result.passed).length, wrong.length),
      wrongFoldInterventionPrecision: rate(
        interrupts.filter((result) => result.expected === 'INTERRUPT' && result.passed).length,
        interrupts.length,
      ),
      falseUrgentInterventionRate: rate(
        correct.filter((result) => result.actual === 'INTERRUPT').length,
        correct.length,
      ),
      occludedUncertainRate: rate(
        occluded.filter((result) => result.actual === 'REQUEST_VISIBILITY').length,
        occluded.length,
      ),
      recoverySelectionRate: rate(
        recovery.filter((result) => result.passed).length,
        recovery.length,
      ),
      interventionLatencyP95Ms: percentile95(latency),
      unsupportedRecoveryInventionCount: results.filter(
        (result) => result.unsupportedRecoveryInvented,
      ).length,
      replayDeterminismRate: rate(replayResults.filter((result) => result.passed).length, replayResults.length),
      whyResponseProvenanceRate: rate(whyResults.filter((result) => result.whyResponseProvenanceLinked === true).length, whyResults.length),
    },
    claimNote: ready
      ? 'Dataset prerequisites are present; report this as an evaluation result, not a safety certification.'
      : 'Fixture results are scaffolding only. Do not claim production accuracy until the required dataset, annotations, and frozen acceptance set are available.',
  };
}