import { createHash } from 'node:crypto';

import {
  WorkflowReferencePackSchema,
  type ProcedureAnnotation,
  type ProcedureGraph,
  type ReferencePackEntry,
  type WorkflowReferencePack,
} from '@vision-codef/contracts';

export type ReferencePackIdentity = {
  id: string;
  companyId: string;
  workflowId: string;
  version: number;
  publishedAt: string;
  publishedByMemberId: string;
};

export function buildReferencePack(
  identity: ReferencePackIdentity,
  graph: ProcedureGraph,
  annotations: readonly ProcedureAnnotation[],
): WorkflowReferencePack {
  if (!graph.published)
    throw new Error('A published procedure is required to build a reference pack.');
  const ordinalByStep = new Map(graph.steps.map((step, index) => [step.id, index]));
  const approved = annotations
    .filter(
      (annotation) =>
        annotation.reviewStatus === 'approved' && ordinalByStep.has(annotation.stepId),
    )
    .sort((left, right) => {
      const stepDifference =
        (ordinalByStep.get(left.stepId) ?? 0) - (ordinalByStep.get(right.stepId) ?? 0);
      return stepDifference || left.startMs - right.startMs || left.id.localeCompare(right.id);
    });
  if (approved.length === 0)
    throw new Error('At least one senior-approved annotation is required.');

  const entries = approved.map(toReferenceEntry);
  const content = {
    procedureVersion: graph.version,
    annotationIds: approved.map((annotation) => annotation.id),
    entries,
  };
  const coverage = {
    correct: entries.filter((entry) => entry.verdict === 'correct').length,
    deviation: entries.filter((entry) => entry.verdict === 'deviation').length,
    uncertain: entries.filter((entry) => entry.verdict === 'uncertain').length,
    stepIds: [...new Set(entries.map((entry) => entry.stepId))],
  };
  return WorkflowReferencePackSchema.parse({
    ...identity,
    procedureVersion: graph.version,
    contentHash: createHash('sha256').update(stableStringify(content)).digest('hex'),
    annotationIds: content.annotationIds,
    entries,
    coverage,
    embeddingStatus: 'not_generated',
  });
}

function toReferenceEntry(annotation: ProcedureAnnotation): ReferencePackEntry {
  const comparisonText = [
    `Verdict: ${annotation.verdict}.`,
    `Object: ${annotation.objectName}.`,
    `Observed action: ${annotation.observedAction}.`,
    `Expected state: ${annotation.expectedState}.`,
    annotation.failureType ? `Failure type: ${annotation.failureType}.` : undefined,
    `Expected next action: ${annotation.expectedNextAction}.`,
    annotation.confidence !== undefined
      ? `Senior confidence: ${Math.round(annotation.confidence * 100)}%.`
      : undefined,
    `Senior reasoning: ${annotation.reasoning}`,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    annotationId: annotation.id,
    stepId: annotation.stepId,
    verdict: annotation.verdict,
    media: {
      captureSessionId: annotation.captureSessionId,
      startMs: annotation.startMs,
      endMs: annotation.endMs,
    },
    comparisonText,
    objectName: annotation.objectName,
    observedAction: annotation.observedAction,
    expectedState: annotation.expectedState,
    ...(annotation.failureType ? { failureType: annotation.failureType } : {}),
    expectedNextAction: annotation.expectedNextAction,
    reasoning: annotation.reasoning,
    ...(annotation.confidence !== undefined ? { confidence: annotation.confidence } : {}),
    ...(annotation.schemaVersion !== undefined ? { schemaVersion: annotation.schemaVersion } : {}),
    documentEvidence: annotation.documentEvidence,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
