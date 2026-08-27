import type {
  CaptureState,
  MediaAssetState,
  ProcedureGraph,
  ProvenanceClass,
} from '@vision-codef/contracts';

export type EngineIssueSeverity = 'error' | 'warning';

export interface EngineIssue {
  code: string;
  path: string;
  message: string;
  severity: EngineIssueSeverity;
}

export interface GraphValidationResult {
  valid: boolean;
  publishable: boolean;
  issues: EngineIssue[];
  graph?: ProcedureGraph;
}

export interface ProcedureExecutionState {
  graphVersion: number;
  currentStateId: string;
  completedStepIds: string[];
  activeStepId?: string;
  status: 'ready' | 'guiding' | 'completed' | 'blocked';
}

export interface ExecutionObservation {
  action?: string;
  nextStateId?: string;
  confidence?: number;
}

export type ExecutionResult =
  | { status: 'advanced'; state: ProcedureExecutionState; stepId: string; nextStateId: string }
  | { status: 'waiting'; state: ProcedureExecutionState; stepId: string; reason: string }
  | { status: 'completed'; state: ProcedureExecutionState }
  | { status: 'invalid'; state: ProcedureExecutionState; reason: string };

export type CaptureEvent =
  | { type: 'PREPARE' }
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'FINALIZE' }
  | { type: 'PROCESS' }
  | { type: 'COMPLETE' }
  | { type: 'FAIL'; reason: string };

export interface ReducerResult<T> {
  state: T;
  accepted: boolean;
  error?: string;
}

export type DeploymentState =
  | 'draft'
  | 'ready'
  | 'starting'
  | 'guiding'
  | 'paused'
  | 'interrupted'
  | 'recovery_required'
  | 'recovering'
  | 'completed'
  | 'failed';

export type DeploymentEvent =
  | { type: 'READY' }
  | { type: 'START' }
  | { type: 'GUIDE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'INTERRUPT'; reason: string }
  | { type: 'DEVIATION_DETECTED'; recoveryId: string; reason: string }
  | { type: 'RECOVERY_STARTED'; recoveryId: string }
  | { type: 'RECOVERY_RESOLVED'; recoveryId: string }
  | { type: 'COMPLETE' }
  | { type: 'FAIL'; reason: string };

export type DeviationStatus =
  | 'clear'
  | 'observing'
  | 'uncertain'
  | 'persisting'
  | 'interrupted'
  | 'recovery_required'
  | 'recovering'
  | 'resolved';

export interface DeviationState {
  status: DeviationStatus;
  observedSinceMs?: number;
  lastObservedAtMs?: number;
  selectedRecoveryId?: string;
  reason?: string;
}

export interface RecoveryTransition {
  id: string;
  fromStateId: string;
  toStateId: string;
  instruction: string;
  approved: true;
  provenance: Extract<ProvenanceClass, 'EXPERT_ASSERTION' | 'REVIEWER_CORRECTION' | 'PUBLISHED_REQUIREMENT'>;
}

export type PaperFoldState =
  | 'flat'
  | 'diagonal-left'
  | 'diagonal-right'
  | 'triangle'
  | 'completed'
  | 'unknown';

export interface Point2D {
  x: number;
  y: number;
}

export type PaperCorners = readonly [Point2D, Point2D, Point2D, Point2D];

export interface PaperCraneGeometryObservation {
  timestampMs: number;
  corners: PaperCorners;
  foldState: PaperFoldState;
  visibilityScore: number;
  alignmentScore: number;
  handOccluded: boolean;
}

export interface PaperCraneTransitionExpectation {
  fromFoldState: PaperFoldState;
  toFoldState: PaperFoldState;
  persistenceMs: number;
  minVisibilityScore: number;
  minAlignmentScore: number;
  recovery: RecoveryTransition;
}

export interface PaperCranePolicy {
  expected: PaperCraneTransitionExpectation;
}

export type PaperCraneDecision =
  | { type: 'WAIT'; status: 'observing' | 'persisting'; reason: string }
  | { type: 'ADVANCED'; status: 'clear'; reason: string }
  | { type: 'REQUEST_VISIBILITY'; status: 'uncertain'; reason: string }
  | { type: 'INTERRUPT'; status: 'recovery_required'; recovery: RecoveryTransition; reason: string };

export interface InductionRequest {
  workflowId: string;
  inputMediaHashes: string[];
  retrievedEvidenceIds: string[];
  modelId: string;
  modelVersion: string;
  adapterVersion: string;
  promptVersion: string;
  decodingParameters: Record<string, string | number | boolean>;
}

export interface InductionDraft {
  graph: ProcedureGraph;
  rawOutput: string;
}

export interface InductionReplayRecord {
  request: InductionRequest;
  draft: InductionDraft;
  requestFingerprint: string;
}

export interface DatasetReadiness {
  approvedGoldenRun: boolean;
  correctRecordings: number;
  requiredCorrectRecordings: number;
  deviationRecordingsByType: Record<string, number>;
  requiredDeviationRecordingsPerType: number;
  portraitAndLandscape: boolean;
  variedLighting: boolean;
  occlusionCases: boolean;
  annotations: boolean;
  participantDisjoint: boolean;
  frozenAcceptanceSet: boolean;
}

export interface PaperCraneFixtureResult {
  fixtureId: string;
  scenario: string;
  expected: string;
  actual: string;
  passed: boolean;
  interventionLatencyMs?: number | undefined;
  unsupportedRecoveryInvented: boolean;
}

export interface PaperCraneMetricReport {
  datasetReadyForAccuracyClaim: boolean;
  results: PaperCraneFixtureResult[];
  metrics: {
    correctStepRecognition: number;
    selectedWrongFoldRecall: number;
    wrongFoldInterventionPrecision: number;
    falseUrgentInterventionRate: number;
    occludedUncertainRate: number;
    recoverySelectionRate: number;
    interventionLatencyP95Ms?: number | undefined;
    unsupportedRecoveryInventionCount: number;
    replayDeterminismRate: number;
    whyResponseProvenanceRate: number;
  };
  claimNote: string;
}

export type OwnedState = CaptureState | MediaAssetState;
