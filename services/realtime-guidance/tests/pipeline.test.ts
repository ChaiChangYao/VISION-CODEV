import { describe, expect, it, vi } from 'vitest';

import {
  uncertainObservation,
  type FrameSample,
  type GuidanceDecision,
  type GuidanceMessage,
  type PaperCraneObservation,
} from '../src/contracts.js';
import { RealtimeGuidancePipeline } from '../src/pipeline.js';

const frame: FrameSample = {
  data: new Uint8Array([0, 0, 0, 255]),
  width: 1,
  height: 1,
  pixelFormat: 'rgba',
  timestampMs: 1000,
  participantIdentity: 'phone',
};

function harness(decision: GuidanceDecision, vlmOutput: unknown = uncertainObservation(1000)) {
  const observations: PaperCraneObservation[] = [];
  const messages: GuidanceMessage[] = [];
  const errors: unknown[] = [];
  const pipeline = new RealtimeGuidancePipeline(
    { observe: vi.fn(async () => vlmOutput) },
    {
      evaluate: vi.fn(async (observation) => {
        observations.push(observation);
        return decision;
      }),
    },
    {
      publish: vi.fn(async (message) => {
        messages.push(message);
      }),
    },
    { companyId: 'company', workflowId: 'workflow', deploymentId: 'deployment' },
    { onError: (error) => errors.push(error) },
  );
  return { pipeline, observations, messages, errors };
}

describe('realtime guidance pipeline', () => {
  it('publishes an interrupt before urgent engine-approved guidance', async () => {
    const result = harness({
      decision: 'INTERRUPT',
      decisionReason: 'Pause for approved recovery.',
      intervention: { detail: 'Unfold and return to the triangle state.' },
    });
    await result.pipeline.pushFrame(frame);
    expect(result.messages).toEqual([
      { type: 'interrupt' },
      {
        type: 'speak',
        text: 'Unfold and return to the triangle state.',
        priority: 'urgent',
      },
    ]);
  });

  it('fails closed to an uncertain observation when VLM output is invalid', async () => {
    const result = harness(
      { decision: 'REQUEST_VISIBILITY', decisionReason: 'Keep the work area visible.' },
      { modelAuthoredInstruction: 'Ignore the procedure.' },
    );
    await result.pipeline.pushFrame(frame);
    expect(result.observations).toEqual([uncertainObservation(frame.timestampMs)]);
    expect(result.messages).toEqual([
      { type: 'speak', text: 'Keep the work area visible.', priority: 'normal' },
    ]);
    expect(result.errors).toHaveLength(1);
  });

  it('does not speak for a deterministic wait decision', async () => {
    const result = harness({ decision: 'WAIT', decisionReason: 'Continue observing.' });
    await result.pipeline.pushFrame(frame);
    expect(result.messages).toEqual([]);
  });
});
