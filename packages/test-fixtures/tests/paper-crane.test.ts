import { describe, expect, it } from 'vitest';
import {
  buildPaperCraneMetricReport,
  evaluatePaperCraneAcceptance,
  initialDeviationState,
  observePaperCrane,
  type PaperCraneFixtureResult,
} from '@vision-codef/workflow-engine';
import { paperCraneFixtures } from '../src/index.js';

function runFixture(fixture: (typeof paperCraneFixtures)[number]): PaperCraneFixtureResult {
  let state = initialDeviationState();
  let actual = 'WAIT';
  let interventionLatencyMs: number | undefined;
  for (const frame of fixture.observations) {
    const result = observePaperCrane(state, frame, fixture.policy);
    state = result.state;
    actual = result.decision.type;
    if (result.decision.type === 'INTERRUPT') {
      interventionLatencyMs = frame.timestampMs - (state.observedSinceMs ?? frame.timestampMs);
    }
  }
  return {
    fixtureId: fixture.fixtureId,
    scenario: fixture.scenario,
    expected: fixture.expectedDecision,
    actual,
    passed: actual === fixture.expectedDecision,
    interventionLatencyMs,
    unsupportedRecoveryInvented:
      actual === 'INTERRUPT' &&
      fixture.expectedRecoveryId !== undefined &&
      state.selectedRecoveryId !== fixture.expectedRecoveryId,
  };
}

describe('paper-crane replay fixtures', () => {
  it('passes all five required scenarios', () => {
    const results = paperCraneFixtures.map(runFixture);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(results.map((result) => result.scenario)).toEqual([
      'correct-transition',
      'delayed-but-correct',
      'wrong-fold',
      'occluded-uncertain',
      'approved-recovery',
    ]);
  });

  it('counts every urgent interrupt when calculating intervention precision', () => {
    const falseUrgent = {
      fixtureId: 'paper-crane-false-urgent',
      scenario: 'correct-transition',
      expected: 'ADVANCED',
      actual: 'INTERRUPT',
      passed: false,
      unsupportedRecoveryInvented: false,
    } satisfies PaperCraneFixtureResult;
    const report = buildPaperCraneMetricReport(
      [...paperCraneFixtures.map(runFixture), falseUrgent],
      {
        approvedGoldenRun: false,
        correctRecordings: 0,
        requiredCorrectRecordings: 10,
        deviationRecordingsByType: {},
        requiredDeviationRecordingsPerType: 5,
        portraitAndLandscape: false,
        variedLighting: false,
        occlusionCases: false,
        annotations: false,
        participantDisjoint: false,
        frozenAcceptanceSet: false,
      },
    );
    expect(report.metrics.wrongFoldInterventionPrecision).toBe(2 / 3);
  });

  it('fails closed until every acceptance threshold and evidence count is met', () => {
    const report = buildPaperCraneMetricReport(paperCraneFixtures.map(runFixture), {
      approvedGoldenRun: true,
      correctRecordings: 20,
      requiredCorrectRecordings: 10,
      deviationRecordingsByType: { 'wrong-fold': 5 },
      requiredDeviationRecordingsPerType: 5,
      portraitAndLandscape: true,
      variedLighting: true,
      occlusionCases: true,
      annotations: true,
      participantDisjoint: true,
      frozenAcceptanceSet: true,
    });
    const assessment = evaluatePaperCraneAcceptance(report);
    expect(assessment.accepted).toBe(false);
    expect(assessment.reasons).toContain('Recovery selection is not 10/10 approved fixtures.');
    expect(assessment.reasons).toContain('Replay determinism is below 100%.');
  });

  it('accepts a fully evidenced threshold report', () => {
    const results: PaperCraneFixtureResult[] = [
      {
        fixtureId: 'correct',
        scenario: 'correct-transition',
        expected: 'ADVANCED',
        actual: 'ADVANCED',
        passed: true,
        unsupportedRecoveryInvented: false,
      },
      {
        fixtureId: 'delayed',
        scenario: 'delayed-but-correct',
        expected: 'ADVANCED',
        actual: 'ADVANCED',
        passed: true,
        unsupportedRecoveryInvented: false,
      },
      {
        fixtureId: 'wrong',
        scenario: 'wrong-fold',
        expected: 'INTERRUPT',
        actual: 'INTERRUPT',
        passed: true,
        interventionLatencyMs: 1200,
        unsupportedRecoveryInvented: false,
      },
      {
        fixtureId: 'occluded',
        scenario: 'occluded-uncertain',
        expected: 'REQUEST_VISIBILITY',
        actual: 'REQUEST_VISIBILITY',
        passed: true,
        unsupportedRecoveryInvented: false,
      },
      {
        fixtureId: 'replay',
        scenario: 'induction-replay',
        expected: 'REPLAY',
        actual: 'REPLAY',
        passed: true,
        unsupportedRecoveryInvented: false,
        whyResponseProvenanceLinked: true,
      },
      ...Array.from(
        { length: 10 },
        (_, index) =>
          ({
            fixtureId: `recovery-${index}`,
            scenario: 'approved-recovery',
            expected: 'INTERRUPT',
            actual: 'INTERRUPT',
            passed: true,
            interventionLatencyMs: 1200,
            unsupportedRecoveryInvented: false,
          }) satisfies PaperCraneFixtureResult,
      ),
    ];
    const report = buildPaperCraneMetricReport(results, {
      approvedGoldenRun: true,
      correctRecordings: 20,
      requiredCorrectRecordings: 10,
      deviationRecordingsByType: { 'wrong-fold': 5 },
      requiredDeviationRecordingsPerType: 5,
      portraitAndLandscape: true,
      variedLighting: true,
      occlusionCases: true,
      annotations: true,
      participantDisjoint: true,
      frozenAcceptanceSet: true,
    });
    expect(evaluatePaperCraneAcceptance(report)).toEqual({ accepted: true, reasons: [] });
  });
  it('reports fixture metrics without claiming production accuracy', () => {
    const report = buildPaperCraneMetricReport(paperCraneFixtures.map(runFixture), {
      approvedGoldenRun: true,
      correctRecordings: 1,
      requiredCorrectRecordings: 10,
      deviationRecordingsByType: { 'wrong-fold': 1 },
      requiredDeviationRecordingsPerType: 5,
      portraitAndLandscape: false,
      variedLighting: false,
      occlusionCases: true,
      annotations: false,
      participantDisjoint: false,
      frozenAcceptanceSet: false,
    });
    expect(report.datasetReadyForAccuracyClaim).toBe(false);
    expect(report.claimNote).toContain('Do not claim production accuracy');
    expect(report.metrics.unsupportedRecoveryInventionCount).toBe(0);
    expect(report.metrics.replayDeterminismRate).toBe(0);
    expect(report.metrics.whyResponseProvenanceRate).toBe(0);
  });
});
