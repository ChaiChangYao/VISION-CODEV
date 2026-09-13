import { describe, expect, it } from 'vitest';
import type { ProcedureGraph } from '@vision-codef/contracts';
import type { DeploymentRun } from './store.js';
import { evaluateTechnicianObservation } from './technician-guidance.js';

const stepIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const graph: ProcedureGraph = {
  id: '33333333-3333-4333-8333-333333333333', version: 1, published: true, states: [],
  steps: stepIds.map((stepId, index) => ({
    id: stepId, ordinalHint: index, title: `Step ${index + 1}`, instruction: `Do approved step ${index + 1}.`,
    observedAction: `Object reaches state ${index + 1}.`, evidenceRefs: [], provenance: ['MODEL_INFERENCE', 'REVIEWER_CORRECTION', 'PUBLISHED_REQUIREMENT'],
    startState: [], expectedAction: [`action ${index + 1}`], endState: [`state ${index + 1}`], allowableVariations: [],
    deviationRules: ['Do not use the wrong part.'], recoveryTransitions: [], confidence: 0.9,
    seniorReview: { reviewed: true, object: 'part', hand: 'both', beforeState: '', afterState: '', uncertainty: '', group: '', reasoning: 'Visible alignment matters.', completionCheck: `State ${index + 1} is visible.`, documentReferences: '' },
  })),
};

function run(): DeploymentRun { return { id: crypto.randomUUID(), workflowId: crypto.randomUUID(), companyId: 'company', status: 'active', currentStep: 0, deviations: [] }; }
function observation(assessment: 'uncertain' | 'in_progress' | 'completed' | 'deviation', timestampMs: number, confidence = 0.95) {
  return { timestampMs, stepId: stepIds[0], assessment, confidence, observedAction: 'Visible action.', evidence: 'Hands and part are visible.', deviationDetail: assessment === 'deviation' ? 'The wrong part is being installed' : undefined };
}

describe('technician guidance reducer', () => {
  it('stays silent for uncertainty and requires two completion confirmations', () => {
    const state = run();
    expect(evaluateTechnicianObservation(state, graph, observation('uncertain', 0)).decision).toBe('WAIT');
    expect(evaluateTechnicianObservation(state, graph, observation('completed', 1000)).decision).toBe('WAIT');
    const advanced = evaluateTechnicianObservation(state, graph, observation('completed', 3000));
    expect(advanced).toMatchObject({ decision: 'ADVANCED', currentInstruction: 'Do approved step 2.' });
    expect(state.currentStep).toBe(1);
  });

  it('interrupts only after the same high-confidence deviation persists', () => {
    const state = run();
    expect(evaluateTechnicianObservation(state, graph, observation('deviation', 1000)).decision).toBe('WAIT');
    const interrupted = evaluateTechnicianObservation(state, graph, observation('deviation', 3000));
    expect(interrupted).toMatchObject({ decision: 'INTERRUPT' });
    expect(interrupted.intervention?.detail).toContain('wrong part');
    expect(interrupted.intervention?.detail).toContain('Do approved step 1.');
  });

  it('resets a candidate when evidence becomes uncertain', () => {
    const state = run();
    evaluateTechnicianObservation(state, graph, observation('completed', 1000));
    evaluateTechnicianObservation(state, graph, observation('uncertain', 2000));
    expect(evaluateTechnicianObservation(state, graph, observation('completed', 3000)).decision).toBe('WAIT');
    expect(state.currentStep).toBe(0);
  });
});
