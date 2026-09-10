import { it, expect } from 'vitest';
import {
  actionGroups,
  reviewCue,
  frameTarget,
  timelineMarkers,
  timeLabel,
} from './review-timeline';
import { demoGraph } from './demo-data';
it('steps one selected-rate frame and clamps at recording boundaries', () => {
  expect(frameTarget(1, 1, 30, 15)).toBeCloseTo(31 / 30);
  expect(frameTarget(1, -1, 30, 15)).toBeCloseTo(29 / 30);
  expect(frameTarget(0, -1, 30, 15)).toBe(0);
  expect(frameTarget(15, 1, 30, 15)).toBeCloseTo(15 - 1 / 30);
});
it('puts overlapping actions on separate clickable lanes', () => {
  const step = demoGraph.steps[0]!;
  const markers = timelineMarkers(
    [
      { ...step, evidenceStartMs: 0, evidenceEndMs: 2000 },
      { ...step, evidenceStartMs: 1000, evidenceEndMs: 3000 },
      { ...step, evidenceStartMs: 3000, evidenceEndMs: 4000 },
    ],
    5000,
  );
  expect(markers.map((marker) => marker.lane)).toEqual([0, 1, 0]);
  expect(markers[1]!.left).toBe(20);
});
it('formats a precise, readable playhead timestamp', () =>
  expect(timeLabel(61250)).toBe('1:01.25'));
it('groups consecutive labels without reordering or merging evidence', () => {
  const step = demoGraph.steps[0]!;
  const steps = ['Prepare', 'Prepare', 'Install', 'Prepare'].map((group) => ({
    ...step,
    seniorReview: { ...step.seniorReview!, group },
  }));
  expect(actionGroups(steps).map((group) => group.indices)).toEqual([[0, 1], [2], [3]]);
  expect(steps).toHaveLength(4);
});
it('replaces vague confidence with checks without inventing a known error', () => {
  const step = demoGraph.steps[0]!;
  expect(
    reviewCue({
      ...step,
      seniorReview: { ...step.seniorReview!, uncertainty: 'low', object: 'clip', hand: 'left' },
    }),
  ).toContain('part/tool name (clip), left/right hand');
  expect(
    reviewCue({
      ...step,
      seniorReview: { ...step.seniorReview!, uncertainty: 'Tool is occluded' },
    }),
  ).toContain('Tool is occluded');
});
