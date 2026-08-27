import type { CaptureState, ProcedureGraph, ProcedureStep, ProvenanceClass, WorkflowFamily } from '@vision-codef/contracts';

export const DEMO_IDS = {
  company: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b01',
  member: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b02',
  workflow: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b03',
  run: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b04',
  session: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b05',
  stepOne: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b06',
  stepTwo: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b07',
  stepThree: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b08',
  stateStart: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b09',
  stateFolded: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b0a',
  stateComplete: '0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b0b',
} as const;

export const demoSteps: ProcedureStep[] = [
  {
    id: DEMO_IDS.stepOne,
    ordinalHint: 0,
    title: 'Set the paper square',
    instruction: 'Place the paper with the white side up and align the bottom edge with the mat.',
    observedAction: 'Paper boundary and four corners are visible.',
    evidenceRefs: [],
    provenance: ['EXPERT_ASSERTION', 'PUBLISHED_REQUIREMENT'],
    startState: ['flat'],
    expectedAction: ['align bottom edge', 'place paper'],
    endState: ['flat-aligned'],
    allowableVariations: ['Small rotation under 5 degrees'],
    deviationRules: ['Request better visibility if fewer than four corners are visible.'],
    recoveryTransitions: [],
    confidence: 0.98,
  },
  {
    id: DEMO_IDS.stepTwo,
    ordinalHint: 1,
    title: 'Fold the top corner down',
    instruction: 'Bring the top corner down to meet the bottom corner, then crease firmly.',
    observedAction: 'Top corner moves toward the bottom corner.',
    evidenceRefs: [],
    provenance: ['EXPERT_ASSERTION', 'SENSOR_OBSERVATION', 'PUBLISHED_REQUIREMENT'],
    startState: ['flat-aligned'],
    expectedAction: ['fold top corner', 'crease'],
    endState: ['triangle-fold'],
    allowableVariations: ['Corner alignment within 12 pixels'],
    deviationRules: ['Interrupt if the left corner is folded to the bottom edge instead.'],
    recoveryTransitions: [DEMO_IDS.stepOne],
    confidence: 0.91,
  },
  {
    id: DEMO_IDS.stepThree,
    ordinalHint: 2,
    title: 'Complete the center crease',
    instruction: 'Press along the center crease from the middle outward until the fold is flat.',
    observedAction: 'Hand tracks along the center crease.',
    evidenceRefs: [],
    provenance: ['EXPERT_ASSERTION', 'PUBLISHED_REQUIREMENT'],
    startState: ['triangle-fold'],
    expectedAction: ['crease center'],
    endState: ['complete'],
    allowableVariations: ['Pause up to 8 seconds before continuing'],
    deviationRules: [],
    recoveryTransitions: [DEMO_IDS.stepTwo],
    confidence: 0.94,
  },
];

export const demoGraph: ProcedureGraph = {
  id: DEMO_IDS.workflow,
  version: 1,
  states: [
    { id: DEMO_IDS.stateStart, label: 'Flat and aligned', predicates: ['four corners visible', 'bottom edge aligned'] },
    { id: DEMO_IDS.stateFolded, label: 'Triangle fold', predicates: ['top corner meets bottom corner'] },
    { id: DEMO_IDS.stateComplete, label: 'Complete', predicates: ['center crease is flat'] },
  ],
  steps: demoSteps,
  published: false,
};

export type LifecycleStage = 'train' | 'processing' | 'approve' | 'deploy';

export const workflow = {
  id: DEMO_IDS.workflow,
  title: 'Paper crane · Golden Run',
  description: 'A reviewable capture for folding a paper crane on the training mat.',
  family: 'golden_run' as WorkflowFamily,
  stage: 'train' as LifecycleStage,
  captureState: 'active' as CaptureState,
  createdAt: 'Today, 09:42',
  updatedAt: 'Just now',
};

export const provenanceLabels: Record<ProvenanceClass, string> = {
  EXPERT_ASSERTION: 'Expert assertion',
  SENSOR_OBSERVATION: 'Sensor observation',
  MODEL_INFERENCE: 'Model inference',
  DOCUMENT_EVIDENCE: 'Document evidence',
  REVIEWER_CORRECTION: 'Reviewer correction',
  PUBLISHED_REQUIREMENT: 'Published requirement',
};
