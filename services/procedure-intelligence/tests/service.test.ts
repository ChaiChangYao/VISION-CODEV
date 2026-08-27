import { describe, expect, it } from 'vitest';
import { ProcedureIntelligenceService } from '../src/index.js';
import type { ProcedureGraph } from '@vision-codef/contracts';

const graph: ProcedureGraph = {
  id: '00000000-0000-4000-8000-000000000001',
  version: 1,
  published: false,
  states: [
    { id: '00000000-0000-4000-8000-000000000010', label: 'Flat', predicates: [] },
    { id: '00000000-0000-4000-8000-000000000011', label: 'Folded', predicates: [] },
  ],
  steps: [{
    id: '00000000-0000-4000-8000-000000000020',
    ordinalHint: 1,
    title: 'Fold',
    instruction: 'Fold the paper.',
    observedAction: 'fold',
    evidenceRefs: [],
    provenance: ['MODEL_INFERENCE'],
    startState: ['00000000-0000-4000-8000-000000000010'],
    expectedAction: ['fold'],
    endState: ['00000000-0000-4000-8000-000000000011'],
    allowableVariations: [],
    deviationRules: [],
    recoveryTransitions: [],
    confidence: 0.7,
  }],
};

describe('ProcedureIntelligenceService', () => {
  it('pins induction and preserves a replay record without making the model deterministic', async () => {
    let calls = 0;
    const service = new ProcedureIntelligenceService({
      async induce() {
        calls += 1;
        return { graph, rawOutput: JSON.stringify(graph) };
      },
    });
    const request = {
      workflowId: '00000000-0000-4000-8000-000000000100',
      inputMediaHashes: ['media-hash'],
      retrievedEvidenceIds: [],
      modelId: 'paper-model',
      modelVersion: '2026.08.1',
      adapterVersion: 'vision-adapter-1',
      promptVersion: 'procedure-prompt-3',
      decodingParameters: { temperature: 0 },
    };
    const first = await service.createDraft(request);
    const replayed = service.replayDraft(first.replay);
    expect(calls).toBe(1);
    expect(replayed.normalizedGraph.contentHash).toBe(first.normalizedGraph.contentHash);
    expect(first.validation.valid).toBe(true);
    expect(first.validation.publishable).toBe(false);
  });
});
