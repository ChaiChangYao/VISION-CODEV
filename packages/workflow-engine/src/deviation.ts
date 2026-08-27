import type {
  DeviationState,
  PaperCraneDecision,
  PaperCraneGeometryObservation,
  PaperCranePolicy,
} from './types.js';
import { isVisiblePaperObservation, normalizePaperGeometry } from './geometry.js';

export function initialDeviationState(): DeviationState {
  return { status: 'clear' };
}

export function observePaperCrane(
  state: DeviationState,
  observation: PaperCraneGeometryObservation,
  policy: PaperCranePolicy,
): { state: DeviationState; decision: PaperCraneDecision } {
  normalizePaperGeometry(observation.corners);
  if (!isVisiblePaperObservation(observation, policy.expected.minVisibilityScore)) {
    return {
      state: {
        ...state,
        status: 'uncertain',
        lastObservedAtMs: observation.timestampMs,
        reason: 'Paper or hands are not sufficiently visible.',
      },
      decision: {
        type: 'REQUEST_VISIBILITY',
        status: 'uncertain',
        reason: 'Please keep the paper and fold line visible.',
      },
    };
  }

  if (observation.foldState === policy.expected.toFoldState) {
    return {
      state: { status: 'resolved', lastObservedAtMs: observation.timestampMs },
      decision: { type: 'ADVANCED', status: 'clear', reason: 'Approved fold transition observed.' },
    };
  }

  if (observation.foldState === policy.expected.fromFoldState) {
    return {
      state: {
        status: 'observing',
        lastObservedAtMs: observation.timestampMs,
        reason: 'Expected fold has not completed.',
      },
      decision: {
        type: 'WAIT',
        status: 'observing',
        reason: 'Continue the current approved fold.',
      },
    };
  }

  const observedSinceMs = state.observedSinceMs ?? observation.timestampMs;
  const elapsed = observation.timestampMs - observedSinceMs;
  if (
    elapsed < policy.expected.persistenceMs ||
    observation.alignmentScore < policy.expected.minAlignmentScore
  ) {
    return {
      state: {
        ...state,
        status: 'persisting',
        observedSinceMs,
        lastObservedAtMs: observation.timestampMs,
        reason: 'Potential deviation is below persistence or alignment threshold.',
      },
      decision: {
        type: 'WAIT',
        status: 'persisting',
        reason: 'Confirming the fold state before interrupting.',
      },
    };
  }

  return {
    state: {
      status: 'recovery_required',
      observedSinceMs,
      lastObservedAtMs: observation.timestampMs,
      selectedRecoveryId: policy.expected.recovery.id,
      reason: 'Wrong fold persisted beyond the configured threshold.',
    },
    decision: {
      type: 'INTERRUPT',
      status: 'recovery_required',
      recovery: policy.expected.recovery,
      reason:
        'Pause: the observed fold is outside the approved transition. Follow the approved recovery.',
    },
  };
}

export function selectApprovedRecovery(
  recoveries: readonly import('./types.js').RecoveryTransition[],
  fromStateId: string,
  toStateId: string,
): import('./types.js').RecoveryTransition | undefined {
  return [...recoveries]
    .filter(
      (recovery) =>
        recovery.approved &&
        recovery.fromStateId === fromStateId &&
        recovery.toStateId === toStateId,
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
}
