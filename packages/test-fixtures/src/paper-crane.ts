import type {
  PaperCraneGeometryObservation,
  PaperCranePolicy,
  PaperCraneTransitionExpectation,
} from '@vision-codef/workflow-engine';

export type PaperCraneScenario =
  | 'correct-transition'
  | 'delayed-but-correct'
  | 'wrong-fold'
  | 'occluded-uncertain'
  | 'approved-recovery';

export interface PaperCraneReplayFixture {
  fixtureId: string;
  scenario: PaperCraneScenario;
  policy: PaperCranePolicy;
  observations: readonly PaperCraneGeometryObservation[];
  expectedDecision: 'ADVANCED' | 'WAIT' | 'REQUEST_VISIBILITY' | 'INTERRUPT';
  expectedRecoveryId?: string;
}

const corners = [
  { x: 0, y: 0 },
  { x: 100, y: 2 },
  { x: 98, y: 100 },
  { x: 2, y: 98 },
] as const;

const recovery = {
  id: '00000000-0000-4000-8000-000000000901',
  fromStateId: 'triangle',
  toStateId: 'triangle',
  instruction: 'Unfold the last crease and return to the triangle state.',
  approved: true as const,
  provenance: 'PUBLISHED_REQUIREMENT' as const,
};

const expectation: PaperCraneTransitionExpectation = {
  fromFoldState: 'triangle',
  toFoldState: 'diagonal-right',
  persistenceMs: 750,
  minVisibilityScore: 0.7,
  minAlignmentScore: 0.8,
  recovery,
};

function observation(
  timestampMs: number,
  foldState: PaperCraneGeometryObservation['foldState'],
  overrides: Partial<PaperCraneGeometryObservation> = {},
): PaperCraneGeometryObservation {
  return {
    timestampMs,
    corners,
    foldState,
    visibilityScore: 0.95,
    alignmentScore: 0.95,
    handOccluded: false,
    ...overrides,
  };
}

export const paperCraneFixtures: readonly PaperCraneReplayFixture[] = [
  {
    fixtureId: 'paper-crane-correct-transition',
    scenario: 'correct-transition',
    policy: { expected: expectation },
    observations: [observation(0, 'diagonal-right')],
    expectedDecision: 'ADVANCED',
  },
  {
    fixtureId: 'paper-crane-delayed-correct',
    scenario: 'delayed-but-correct',
    policy: { expected: expectation },
    observations: [
      observation(0, 'triangle'),
      observation(500, 'triangle'),
      observation(1000, 'diagonal-right'),
    ],
    expectedDecision: 'ADVANCED',
  },
  {
    fixtureId: 'paper-crane-wrong-fold',
    scenario: 'wrong-fold',
    policy: { expected: expectation },
    observations: [observation(0, 'diagonal-left'), observation(800, 'diagonal-left')],
    expectedDecision: 'INTERRUPT',
    expectedRecoveryId: recovery.id,
  },
  {
    fixtureId: 'paper-crane-occluded-uncertain',
    scenario: 'occluded-uncertain',
    policy: { expected: expectation },
    observations: [
      observation(1000, 'diagonal-left', { handOccluded: true, visibilityScore: 0.4 }),
    ],
    expectedDecision: 'REQUEST_VISIBILITY',
  },
  {
    fixtureId: 'paper-crane-approved-recovery',
    scenario: 'approved-recovery',
    policy: { expected: expectation },
    observations: [observation(0, 'diagonal-left'), observation(800, 'diagonal-left')],
    expectedDecision: 'INTERRUPT',
    expectedRecoveryId: recovery.id,
  },
];
