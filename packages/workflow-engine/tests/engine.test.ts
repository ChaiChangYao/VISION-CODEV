import { describe, expect, it } from 'vitest';
import type { ProcedureGraph } from '@vision-codef/contracts';
import {
  createExecutionState,
  executeNextStep,
  normalizeProcedureGraph,
  publishProcedureGraph,
  reduceCaptureState,
  reduceDeploymentState,
  validateProcedureGraph,
} from '../src/index.js';

const ids = {
  graph: '00000000-0000-4000-8000-000000001001',
  start: '00000000-0000-4000-8000-000000001010',
  end: '00000000-0000-4000-8000-000000001011',
  step: '00000000-0000-4000-8000-000000001020',
};

const graph: ProcedureGraph = {
  id: ids.graph,
  version: 1,
  published: false,
  states: [
    { id: ids.end, label: ' Done ', predicates: ['complete', 'complete'] },
    { id: ids.start, label: 'Start', predicates: [] },
  ],
  steps: [
    {
      id: ids.step,
      ordinalHint: 1,
      title: '  Fold  ',
      instruction: 'Fold the paper.',
      observedAction: 'fold',
      evidenceRefs: [],
      provenance: ['MODEL_INFERENCE', 'EXPERT_ASSERTION'],
      startState: [ids.start],
      expectedAction: ['fold', 'fold'],
      endState: [ids.end],
      allowableVariations: [],
      deviationRules: [],
      recoveryTransitions: [],
      confidence: 0.9,
    },
  ],
};

describe('deterministic procedure engine', () => {
  it('normalizes repeated values and yields a stable hash', () => {
    const first = normalizeProcedureGraph(graph);
    const second = normalizeProcedureGraph({ ...graph, states: [...graph.states].reverse() });
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.steps[0]?.title).toBe('Fold');
    expect(first.steps[0]?.expectedAction).toEqual(['fold']);
  });

  it('does not publish model inference without publication provenance', () => {
    const result = validateProcedureGraph({
      ...graph,
      published: true,
      steps: [{ ...graph.steps[0]!, provenance: ['MODEL_INFERENCE'] }],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain('UNAPPROVED_INFERENCE');
    expect(result.issues.map((entry) => entry.code)).toContain('PUBLISH_APPROVAL_REQUIRED');
  });

  it('executes only approved actions and states', () => {
    const state = createExecutionState(graph);
    const waiting = executeNextStep(graph, state, { action: 'tear' });
    expect(waiting.status).toBe('waiting');
    const advanced = executeNextStep(graph, state, { action: 'fold', nextStateId: ids.end });
    expect(advanced.status).toBe('completed');
  });

  it('enforces capture and deployment state transitions', () => {
    expect(reduceCaptureState('draft', { type: 'START' }).accepted).toBe(false);
    expect(reduceCaptureState('draft', { type: 'PREPARE' }).state).toBe('preparing');
    expect(
      reduceDeploymentState('guiding', {
        type: 'DEVIATION_DETECTED',
        recoveryId: 'r',
        reason: 'wrong',
      }).state,
    ).toBe('recovery_required');
    expect(
      reduceDeploymentState('guiding', { type: 'RECOVERY_STARTED', recoveryId: 'r' }).accepted,
    ).toBe(false);
  });

  it('publishes only with explicit publication provenance', () => {
    const published = publishProcedureGraph({
      ...graph,
      steps: [{ ...graph.steps[0]!, provenance: ['EXPERT_ASSERTION', 'PUBLISHED_REQUIREMENT'] }],
    });
    expect(published.published).toBe(true);
    expect(published.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
