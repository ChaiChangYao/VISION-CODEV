import type { ProcedureGraph, ProcedureStep } from '@vision-codef/contracts';
export function reviseAction(
  graph: ProcedureGraph,
  id: string,
  patch: Partial<ProcedureStep>,
): ProcedureGraph {
  if (graph.published) throw new Error('Published procedures are immutable.');
  return {
    ...graph,
    steps: graph.steps.map((step) =>
      step.id === id
        ? {
            ...step,
            ...patch,
            seniorReview: { ...step.seniorReview!, ...patch.seniorReview, reviewed: false },
            provenance: step.provenance.filter(
              (value) =>
                !['PUBLISHED_REQUIREMENT', 'EXPERT_ASSERTION', 'REVIEWER_CORRECTION'].includes(
                  value,
                ),
            ),
          }
        : step,
    ),
  };
}
export function reviewAction(graph: ProcedureGraph, id: string): ProcedureGraph {
  if (graph.published) throw new Error('Published procedures are immutable.');
  return {
    ...graph,
    steps: graph.steps.map((step) =>
      step.id === id
        ? {
            ...step,
            seniorReview: { ...step.seniorReview!, reviewed: true },
            provenance: [...new Set([...step.provenance, 'REVIEWER_CORRECTION' as const])],
          }
        : step,
    ),
  };
}
export function publicationCandidate(graph: ProcedureGraph): ProcedureGraph {
  if (!graph.steps.length || graph.steps.some((step) => !step.seniorReview?.reviewed))
    throw new Error('Review every action before publishing.');
  return {
    ...graph,
    steps: graph.steps.map((step) => ({
      ...step,
      provenance: [...new Set([...step.provenance, 'PUBLISHED_REQUIREMENT' as const])],
    })),
  };
}
export function restructureActions(graph: ProcedureGraph, steps: ProcedureStep[]): ProcedureGraph {
  if (graph.published) throw new Error('Published procedures are immutable.');
  const states = Array.from({ length: steps.length + 1 }, (_, index) => ({
    id: crypto.randomUUID(),
    label: `Observation boundary ${index}`,
    predicates: [],
  }));
  return {
    ...graph,
    states,
    steps: steps.map((step, index) => ({
      ...step,
      ordinalHint: index,
      startState: [states[index]!.id],
      endState: [states[index + 1]!.id],
      recoveryTransitions: [],
      seniorReview: { ...step.seniorReview!, reviewed: false },
      provenance: step.provenance.filter(
        (value) => value === 'MODEL_INFERENCE' || value === 'SENSOR_OBSERVATION',
      ),
    })),
  };
}
