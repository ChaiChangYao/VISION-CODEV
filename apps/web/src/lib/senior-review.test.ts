import { it, expect } from 'vitest';
import { demoGraph } from './demo-data';
import { ProcedureGraphSchema } from '@vision-codef/contracts';
import {
  publicationCandidate,
  reviseAction,
  reviewAction,
  restructureActions,
} from './senior-review';
const draft = () => ({
  ...demoGraph,
  published: false,
  steps: demoGraph.steps.map((step) => ({
    ...step,
    seniorReview: {
      reviewed: false,
      object: '',
      hand: 'unknown' as const,
      beforeState: '',
      afterState: '',
      uncertainty: '',
      group: '',
      reasoning: '',
      completionCheck: '',
      documentReferences: '',
    },
  })),
});
it('does not approve merely by selecting or saving, and edits reset approval', () => {
  let graph = draft();
  expect(() => publicationCandidate(graph)).toThrow('Review every action');
  for (const step of graph.steps) graph = reviewAction(graph, step.id) as typeof graph;
  expect(
    publicationCandidate(graph).steps.every((s) => s.provenance.includes('PUBLISHED_REQUIREMENT')),
  ).toBe(true);
  const revised = reviseAction(graph, graph.steps[0]!.id, { instruction: 'Changed' });
  expect(revised.steps[0]!.seniorReview!.reviewed).toBe(false);
  expect(() => publicationCandidate(revised)).toThrow();
});
it('rebuilds references after removing an action and resets structural approvals', () => {
  const graph = draft();
  const changed = restructureActions(graph, graph.steps.slice(1));
  expect(changed.states).toHaveLength(changed.steps.length + 1);
  expect(
    changed.steps.every((s) => !s.seniorReview!.reviewed && s.recoveryTransitions.length === 0),
  ).toBe(true);
});
it('persists timestamped reasoning through the contract and clears prior review', () => {
  const graph = draft();
  const step = graph.steps[0]!;
  const reviewed = reviewAction(graph, step.id);
  const revised = reviseAction(reviewed, step.id, {
    seniorReview: {
      ...step.seniorReview,
      findings: [
        {
          id: '00000000-0000-4000-8000-000000009999',
          timestampMs: 1234,
          text: 'Check this contact point before moving.',
        },
      ],
    },
  });
  const roundTrip = ProcedureGraphSchema.parse(JSON.parse(JSON.stringify(revised)));
  expect(roundTrip.steps[0]!.seniorReview!.findings?.[0]?.timestampMs).toBe(1234);
  expect(roundTrip.steps[0]!.seniorReview!.reviewed).toBe(false);
});
it('preserves spatial notes in saved graphs and rejects invalid coordinates', () => {
  const graph = draft();
  const step = graph.steps[0]!;
  const finding = {
    id: '00000000-0000-4000-8000-000000009999',
    timestampMs: 1234,
    text: 'Press this clip',
    region: { x: 0.3, y: 0.6, radius: 0.1 },
  };
  const revised = reviseAction(reviewAction(graph, step.id), step.id, {
    seniorReview: { ...step.seniorReview, findings: [finding] },
  });
  expect(
    ProcedureGraphSchema.parse(JSON.parse(JSON.stringify(revised))).steps[0]!.seniorReview!
      .findings![0]!.region,
  ).toEqual(finding.region);
  expect(revised.steps[0]!.seniorReview!.reviewed).toBe(false);
  finding.region.x = 2;
  expect(ProcedureGraphSchema.safeParse(revised).success).toBe(false);
});
