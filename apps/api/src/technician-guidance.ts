import type { ProcedureGraph, ProcedureStep } from '@vision-codef/contracts';
import type { DeploymentRun } from './store.js';

export type TechnicianObservation = {
  timestampMs: number;
  stepId: string;
  assessment: 'uncertain' | 'in_progress' | 'completed' | 'deviation';
  confidence: number;
  observedAction: string;
  evidence: string;
  deviationDetail?: string;
};

export type ApprovedStepContext = ReturnType<typeof approvedStepContext>;
export type TechnicianGuidanceDecision = {
  decision: 'WAIT' | 'ADVANCED' | 'INTERRUPT';
  decisionReason: string;
  currentInstruction?: string;
  currentStep?: ApprovedStepContext;
  intervention?: { detail: string; recoveryStepId: string };
};

const COMPLETE_CONFIDENCE = 0.82;
const DEVIATION_CONFIDENCE = 0.88;
const REQUIRED_CONFIRMATIONS = 2;

export function approvedStepContext(step: ProcedureStep, index: number, totalSteps: number) {
  return {
    id: step.id,
    ordinal: index + 1,
    totalSteps,
    title: step.title,
    instruction: step.instruction,
    observedAction: step.observedAction,
    startState: step.startState,
    expectedAction: step.expectedAction,
    endState: step.endState,
    allowableVariations: step.allowableVariations,
    deviationRules: step.deviationRules,
    completionCheck: step.seniorReview?.completionCheck ?? '',
    seniorReasoning: step.seniorReview?.reasoning ?? '',
  };
}

export function currentApprovedStep(run: DeploymentRun, graph: ProcedureGraph): ApprovedStepContext | undefined {
  const step = graph.steps[run.currentStep];
  return step ? approvedStepContext(step, run.currentStep, graph.steps.length) : undefined;
}

export function evaluateTechnicianObservation(
  run: DeploymentRun,
  graph: ProcedureGraph,
  input: unknown,
): TechnicianGuidanceDecision {
  const observation = parseTechnicianObservation(input);
  const current = currentApprovedStep(run, graph);
  if (!current) return { decision: 'WAIT', decisionReason: 'Tutorial is already complete.' };
  if (observation.stepId !== current.id) throw new Error('Observation does not match the current approved step.');
  run.lastObservation = observation;

  const eligible =
    (observation.assessment === 'completed' && observation.confidence >= COMPLETE_CONFIDENCE) ||
    (observation.assessment === 'deviation' && observation.confidence >= DEVIATION_CONFIDENCE);
  if (!eligible) {
    run.guidanceCandidate = undefined;
    return { decision: 'WAIT', decisionReason: 'Evidence is uncertain or the approved step is still in progress.', currentStep: current };
  }

  const kind = observation.assessment as 'completed' | 'deviation';
  const previous = run.guidanceCandidate;
  run.guidanceCandidate = previous?.stepId === current.id && previous.kind === kind
    ? { ...previous, count: previous.count + 1, lastTimestampMs: observation.timestampMs }
    : { stepId: current.id, kind, count: 1, sinceTimestampMs: observation.timestampMs, lastTimestampMs: observation.timestampMs };

  if (run.guidanceCandidate.count < REQUIRED_CONFIRMATIONS) {
    return { decision: 'WAIT', decisionReason: `Waiting for a second independent ${kind} observation.`, currentStep: current };
  }
  run.guidanceCandidate = undefined;

  if (kind === 'completed') {
    run.intervention = undefined;
    run.currentStep += 1;
    const next = currentApprovedStep(run, graph);
    if (!next) {
      run.status = 'completed';
      return { decision: 'ADVANCED', decisionReason: 'The final approved step was visually confirmed.', currentInstruction: 'Tutorial complete.' };
    }
    run.status = 'active';
    return { decision: 'ADVANCED', decisionReason: 'The approved completion condition was visually confirmed.', currentInstruction: next.instruction, currentStep: next };
  }

  const factualDetail = cleanDetail(observation.deviationDetail || observation.evidence || 'The visible action does not match the approved step');
  const correction = `Pause. ${factualDetail}. Return to the approved step: ${current.instruction}`;
  run.status = 'active';
  run.intervention = {
    title: 'Step needs correction', detail: correction, recoveryStepId: current.id,
    confidence: observation.confidence, persistenceMs: Math.max(0, observation.timestampMs - (previous?.sinceTimestampMs ?? observation.timestampMs)),
  };
  run.deviations.push({ id: crypto.randomUUID(), state: 'confirmed', severity: 'stop' });
  return { decision: 'INTERRUPT', decisionReason: 'A persistent visible mismatch was confirmed.', currentStep: current, intervention: { detail: correction, recoveryStepId: current.id } };
}

function cleanDetail(value: string): string {
  const normalized = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  return (normalized || 'The visible action does not match the approved step').slice(0, 160);
}

function parseTechnicianObservation(input: unknown): TechnicianObservation {
  if (!input || typeof input !== 'object') throw new Error('Observation must be an object.');
  const value = input as Record<string, unknown>;
  const assessment = value.assessment;
  const timestampMs = value.timestampMs;
  const confidence = value.confidence;
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs < 0) throw new Error('timestampMs must be a nonnegative number.');
  if (typeof value.stepId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value.stepId)) throw new Error('stepId must be a UUID.');
  if (!['uncertain', 'in_progress', 'completed', 'deviation'].includes(String(assessment))) throw new Error('assessment is invalid.');
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) throw new Error('confidence must be between 0 and 1.');
  if (typeof value.observedAction !== 'string' || value.observedAction.length > 500) throw new Error('observedAction is invalid.');
  if (typeof value.evidence !== 'string' || value.evidence.length > 500) throw new Error('evidence is invalid.');
  if (value.deviationDetail !== undefined && (typeof value.deviationDetail !== 'string' || value.deviationDetail.length > 300)) throw new Error('deviationDetail is invalid.');
  return value as TechnicianObservation;
}
