import {
  initialDeviationState,
  observePaperCrane,
  type DeviationState,
  type PaperCraneDecision,
  type PaperCraneGeometryObservation,
  type PaperCranePolicy,
} from '@vision-codef/workflow-engine';

export const PAPER_CRANE_POLICY: PaperCranePolicy = {
  expected: {
    fromFoldState: 'triangle',
    toFoldState: 'diagonal-right',
    persistenceMs: 750,
    minVisibilityScore: 0.7,
    minAlignmentScore: 0.8,
    recovery: {
      id: '00000000-0000-4000-8000-000000000901',
      fromStateId: 'triangle',
      toStateId: 'triangle',
      instruction: 'Unfold the last crease and return to the triangle state.',
      approved: true,
      provenance: 'PUBLISHED_REQUIREMENT',
    },
  },
};

export type PaperCraneObservationInput = Omit<PaperCraneGeometryObservation, 'corners'> & {
  corners: Array<{ x: number; y: number }>;
};

export function parsePaperCraneObservation(value: Record<string, unknown>): PaperCraneGeometryObservation {
  const corners = value.corners;
  if (!Array.isArray(corners) || corners.length !== 4 || corners.some((point) => {
    if (typeof point !== 'object' || point === null) return true;
    const candidate = point as Record<string, unknown>;
    return typeof candidate.x !== 'number' || typeof candidate.y !== 'number';
  })) {
    throw new Error('corners must contain exactly four points.');
  }
  const foldState = value.foldState;
  if (!['flat', 'diagonal-left', 'diagonal-right', 'triangle', 'completed', 'unknown'].includes(String(foldState))) {
    throw new Error('foldState is not supported.');
  }
  const observation: PaperCraneGeometryObservation = {
    timestampMs: Number(value.timestampMs),
    corners: corners.map((point) => ({ x: Number((point as Record<string, number>).x), y: Number((point as Record<string, number>).y) })) as unknown as PaperCraneGeometryObservation['corners'],
    foldState: String(foldState) as PaperCraneGeometryObservation['foldState'],
    visibilityScore: Number(value.visibilityScore),
    alignmentScore: Number(value.alignmentScore),
    handOccluded: Boolean(value.handOccluded),
  };
  if (!Number.isFinite(observation.timestampMs) || !Number.isFinite(observation.visibilityScore) || !Number.isFinite(observation.alignmentScore)) {
    throw new Error('timestampMs, visibilityScore, and alignmentScore must be finite numbers.');
  }
  return observation;
}

export type PaperCraneObservationResult = {
  state: DeviationState;
  decision: PaperCraneDecision;
};

export function evaluatePaperCraneObservation(
  state: DeviationState | undefined,
  input: Record<string, unknown>,
): PaperCraneObservationResult {
  return observePaperCrane(state ?? initialDeviationState(), parsePaperCraneObservation(input), PAPER_CRANE_POLICY);
}

