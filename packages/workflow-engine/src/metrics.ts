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
      replayDeterminismRate: rate(
        replayResults.filter((result) => result.passed).length,
        replayResults.length,
      ),
      whyResponseProvenanceRate: rate(
        whyResults.filter((result) => result.whyResponseProvenanceLinked === true).length,
        whyResults.length,
      ),
    },
    claimNote: ready
      ? 'Dataset prerequisites are present; report this as an evaluation result, not a safety certification.'
      : 'Fixture results are scaffolding only. Do not claim production accuracy until the required dataset, annotations, and frozen acceptance set are available.',
  };
}
export interface PaperCraneAcceptanceAssessment {
  accepted: boolean;
  reasons: string[];
}

export function evaluatePaperCraneAcceptance(
  report: PaperCraneMetricReport,
): PaperCraneAcceptanceAssessment {
  const reasons: string[] = [];
  const metrics = report.metrics;
  const recoveryFixtureCount = report.results.filter(
    (result) => result.scenario === 'approved-recovery',
  ).length;

  if (!report.datasetReadyForAccuracyClaim)
    reasons.push('Dataset readiness gate is not satisfied.');
  if (metrics.correctStepRecognition < 0.9) reasons.push('Correct-step recognition is below 90%.');
  if (metrics.selectedWrongFoldRecall < 0.9)
    reasons.push('Selected wrong-fold recall is below 90%.');
  if (metrics.wrongFoldInterventionPrecision < 0.9)
    reasons.push('Wrong-fold intervention precision is below 90%.');
  if (metrics.falseUrgentInterventionRate > 0.05)
    reasons.push('False urgent interventions exceed 5% of correct transitions.');
  if (metrics.occludedUncertainRate < 0.9)
    reasons.push('Occluded-state uncertainty handling is below 90%.');
  if (recoveryFixtureCount < 10 || metrics.recoverySelectionRate !== 1)
    reasons.push('Recovery selection is not 10/10 approved fixtures.');
  if (metrics.interventionLatencyP95Ms === undefined || metrics.interventionLatencyP95Ms > 2000)
    reasons.push('Intervention latency p95 exceeds 2 seconds or is unmeasured.');
  if (metrics.unsupportedRecoveryInventionCount !== 0)
    reasons.push('Unsupported recovery invention was observed.');
  if (metrics.replayDeterminismRate !== 1) reasons.push('Replay determinism is below 100%.');
  if (metrics.whyResponseProvenanceRate !== 1)
    reasons.push('Why-response provenance linkage is below 100%.');

  return { accepted: reasons.length === 0, reasons };
}
