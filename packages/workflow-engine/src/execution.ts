import type { ProcedureGraph } from '@vision-codef/contracts';
import type { ExecutionObservation, ExecutionResult, ProcedureExecutionState } from './types.js';

function firstStep(graph: ProcedureGraph, currentStateId: string, completed: Set<string>) {
  return graph.steps.find(
    (step) => !completed.has(step.id) && step.startState.includes(currentStateId),
  );
}

export function createExecutionState(graph: ProcedureGraph): ProcedureExecutionState {
  const first = [...graph.steps].sort(
    (a, b) => a.ordinalHint - b.ordinalHint || a.id.localeCompare(b.id),
  )[0];
  const currentStateId = first?.startState[0] ?? graph.states[0]?.id;
  if (!currentStateId) throw new Error('A procedure graph needs at least one state.');
  return {
    graphVersion: graph.version,
    currentStateId,
    completedStepIds: [],
    status: 'ready',
  };
}

export function executeNextStep(
  graph: ProcedureGraph,
  state: ProcedureExecutionState,
  observation: ExecutionObservation,
): ExecutionResult {
  if (state.status === 'completed') return { status: 'completed', state };
  if (state.graphVersion !== graph.version)
    return { status: 'invalid', state, reason: 'Graph version mismatch.' };

  const step = firstStep(graph, state.currentStateId, new Set(state.completedStepIds));
  if (!step) {
    const { activeStepId: _activeStepId, ...withoutActiveStep } = state;
    const completed = { ...withoutActiveStep, status: 'completed' as const };
    return { status: 'completed', state: completed };
  }

  const nextStateId = observation.nextStateId ?? step.endState[0];
  if (!nextStateId || !step.endState.includes(nextStateId)) {
    return {
      status: 'invalid',
      state: { ...state, status: 'blocked' },
      reason: 'Observation selected an unapproved end state.',
    };
  }
  if (!observation.action) {
    return {
      status: 'waiting',
      state: { ...state, status: 'guiding', activeStepId: step.id },
      stepId: step.id,
      reason: step.instruction,
    };
  }
  const actionMatches = step.expectedAction.some(
    (expected) => expected === observation.action || expected === '*',
  );
  if (!actionMatches) {
    return {
      status: 'waiting',
      state: { ...state, status: 'guiding', activeStepId: step.id },
      stepId: step.id,
      reason: 'Observed action is not an approved action for this step.',
    };
  }

  const completedStepIds = [...state.completedStepIds, step.id];
  const next: ProcedureExecutionState = {
    ...state,
    currentStateId: nextStateId,
    completedStepIds,
    status: completedStepIds.length === graph.steps.length ? 'completed' : 'guiding',
  };
  if (next.status === 'completed') return { status: 'completed', state: next };
  return { status: 'advanced', state: next, stepId: step.id, nextStateId };
}
