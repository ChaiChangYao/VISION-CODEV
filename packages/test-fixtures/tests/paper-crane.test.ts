import { describe, expect, it } from 'vitest';
import {
  buildPaperCraneMetricReport,
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
    unsupportedRecoveryInvented: actual === 'INTERRUPT' && fixture.expectedRecoveryId !== undefined && state.selectedRecoveryId !== fixture.expectedRecoveryId,
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
  });
});
