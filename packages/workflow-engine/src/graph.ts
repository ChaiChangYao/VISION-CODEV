import {
  ProcedureGraphSchema,
  type ProcedureGraph,
  type ProcedureStep,
} from '@vision-codef/contracts';
import { sha256, uniqueSorted } from './canonical.js';
import type { EngineIssue, GraphValidationResult } from './types.js';

const approvedProvenance = new Set(['EXPERT_ASSERTION', 'REVIEWER_CORRECTION', 'PUBLISHED_REQUIREMENT']);

export class GraphValidationError extends Error {
  constructor(public readonly issues: EngineIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'GraphValidationError';
  }
}

function issue(code: string, path: string, message: string, severity: 'error' | 'warning' = 'error'): EngineIssue {
  return { code, path, message, severity };
}

function normalizeStep(step: ProcedureStep): ProcedureStep {
  return {
    ...step,
    title: step.title.trim(),
    instruction: step.instruction.trim(),
    observedAction: step.observedAction.trim(),
    evidenceRefs: uniqueSorted(step.evidenceRefs),
    provenance: uniqueSorted(step.provenance) as ProcedureStep['provenance'],
    startState: uniqueSorted(step.startState),
    expectedAction: uniqueSorted(step.expectedAction),
    endState: uniqueSorted(step.endState),
    allowableVariations: uniqueSorted(step.allowableVariations),
    deviationRules: uniqueSorted(step.deviationRules),
    recoveryTransitions: uniqueSorted(step.recoveryTransitions),
  };
}

export function normalizeProcedureGraph(graph: ProcedureGraph): ProcedureGraph {
  const parsed = ProcedureGraphSchema.safeParse(graph);
  if (!parsed.success) {
    throw new GraphValidationError([
      issue('SCHEMA_INVALID', 'graph', parsed.error.message),
    ]);
  }

  const normalized: ProcedureGraph = {
    id: parsed.data.id,
    version: parsed.data.version,
    states: [...parsed.data.states]
      .map((state) => ({
        ...state,
        label: state.label.trim(),
        predicates: uniqueSorted(state.predicates),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    steps: [...parsed.data.steps]
      .map(normalizeStep)
      .sort((a, b) => a.ordinalHint - b.ordinalHint || a.id.localeCompare(b.id)),
    published: parsed.data.published,
  };

  normalized.contentHash = sha256(normalized);
  return normalized;
}

export function validateProcedureGraph(graph: ProcedureGraph): GraphValidationResult {
  const issues: EngineIssue[] = [];
  let normalized: ProcedureGraph;

  try {
    normalized = normalizeProcedureGraph(graph);
  } catch (error) {
    if (error instanceof GraphValidationError) return { valid: false, publishable: false, issues: error.issues };
    throw error;
  }

  const stateIds = new Set<string>();
  normalized.states.forEach((state, index) => {
    if (stateIds.has(state.id)) issues.push(issue('DUPLICATE_STATE_ID', `states[${index}].id`, 'State IDs must be unique.'));
    stateIds.add(state.id);
  });

  const stepIds = new Set<string>();
  let previousOrdinal = -1;
  normalized.steps.forEach((step, index) => {
    if (stepIds.has(step.id)) issues.push(issue('DUPLICATE_STEP_ID', `steps[${index}].id`, 'Step IDs must be unique.'));
    stepIds.add(step.id);
    if (step.ordinalHint < previousOrdinal) {
      issues.push(issue('ORDINAL_OUT_OF_ORDER', `steps[${index}].ordinalHint`, 'Steps must have non-decreasing ordinal hints.'));
    }
    previousOrdinal = step.ordinalHint;

    for (const stateId of [...step.startState, ...step.endState]) {
      if (!stateIds.has(stateId)) {
        issues.push(issue('UNKNOWN_STATE', `steps[${index}]`, `Unknown procedure state: ${stateId}.`));
      }
    }
    for (const recoveryId of step.recoveryTransitions) {
      if (!stepIds.has(recoveryId) && !normalized.steps.some((candidate) => candidate.id === recoveryId)) {
        issues.push(issue('UNKNOWN_RECOVERY', `steps[${index}].recoveryTransitions`, `Unknown recovery transition: ${recoveryId}.`));
      }
    }
    if (step.provenance.includes('MODEL_INFERENCE') && !step.provenance.some((value) => approvedProvenance.has(value))) {
      issues.push(issue('UNAPPROVED_INFERENCE', `steps[${index}].provenance`, 'Model inference requires expert assertion, reviewer correction, or published requirement before it can guide execution.'));
    }
    if (normalized.published && !step.provenance.includes('PUBLISHED_REQUIREMENT')) {
      issues.push(issue('PUBLISH_APPROVAL_REQUIRED', `steps[${index}].provenance`, 'Published steps require PUBLISHED_REQUIREMENT provenance.'));
    }
  });

  const hasErrors = issues.some((entry) => entry.severity === 'error');
  return {
    valid: !hasErrors,
    publishable: !hasErrors && normalized.published,
    issues,
    graph: normalized,
  };
}

export function publishProcedureGraph(graph: ProcedureGraph): ProcedureGraph {
  const candidate = { ...graph, published: true };
  const result = validateProcedureGraph(candidate);
  if (!result.valid || !result.publishable) throw new GraphValidationError(result.issues);
  return result.graph as ProcedureGraph;
}
