import { describe, expect, it } from 'vitest';

import type { ProcedureAnnotation, ProcedureGraph } from '@vision-codef/contracts';
import { buildReferencePack } from './reference-pack.js';

const companyId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e20';
const workflowId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e21';
const stepId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e22';
const captureSessionId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e23';
const memberId = '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e24';

const graph: ProcedureGraph = {
  id: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e25',
  version: 1,
  published: true,
  contentHash: 'published',
  states: [{ id: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e26', label: 'ready', predicates: [] }],
  steps: [
    {
      id: stepId,
      ordinalHint: 0,
      title: 'Install pad',
      instruction: 'Install the brake pad in the approved orientation.',
      observedAction: 'install pad',
      evidenceRefs: [],
      provenance: ['REVIEWER_CORRECTION'],
      startState: ['ready'],
      expectedAction: ['install pad'],
      endState: ['installed'],
      allowableVariations: [],
      deviationRules: ['wrong orientation'],
      recoveryTransitions: [],
      confidence: 1,
    },
  ],
};

function annotation(overrides: Partial<ProcedureAnnotation> = {}): ProcedureAnnotation {
  return {
    id: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e27',
    companyId,
    workflowId,
    stepId,
    captureSessionId,
    startMs: 1000,
    endMs: 2000,
    verdict: 'correct',
    objectName: 'brake pad',
    observedAction: 'installed with wear indicator inward',
    expectedState: 'pad seated correctly',
    expectedNextAction: 'inspect seating',
    reasoning: 'The retaining features and indicator are visible in the approved orientation.',
    confidence: 0.8,
    schemaVersion: 1,
    documentEvidence: [],
    origin: 'senior',
    reviewStatus: 'approved',
    revision: 1,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
    reviewedByMemberId: memberId,
    reviewedAt: '2026-08-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('workflow reference packs', () => {
  it('includes only approved annotations and reports coverage without embeddings', () => {
    const pack = buildReferencePack(
      {
        id: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e28',
        companyId,
        workflowId,
        version: 1,
        publishedAt: '2026-08-28T01:00:00.000Z',
        publishedByMemberId: memberId,
      },
      graph,
      [
        annotation(),
        annotation({
          id: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e29',
          reviewStatus: 'rejected',
        }),
      ],
    );

    expect(pack.annotationIds).toHaveLength(1);
    expect(pack.coverage).toEqual({ correct: 1, deviation: 0, uncertain: 0, stepIds: [stepId] });
    expect(pack.embeddingStatus).toBe('not_generated');
    expect(pack.entries[0]?.comparisonText).toContain('Senior reasoning');
    expect(pack.entries[0]).toMatchObject({ confidence: 0.8, schemaVersion: 1 });
    expect(pack.entries[0]?.comparisonText).toContain('Senior confidence: 80%');
  });

  it('produces the same content hash for the same reviewed evidence', () => {
    const first = buildReferencePack(
      {
        id: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e28',
        companyId,
        workflowId,
        version: 1,
        publishedAt: '2026-08-28T01:00:00.000Z',
        publishedByMemberId: memberId,
      },
      graph,
      [annotation()],
    );
    const second = buildReferencePack(
      {
        id: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e29',
        companyId,
        workflowId,
        version: 2,
        publishedAt: '2026-08-28T02:00:00.000Z',
        publishedByMemberId: memberId,
      },
      graph,
      [annotation()],
    );
    expect(second.contentHash).toBe(first.contentHash);
  });
});
