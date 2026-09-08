import { describe, expect, it, vi } from 'vitest';

import type { ChangeDetector } from '../src/changeDetection.js';
import { ChangeTriggeredGuidancePipeline } from '../src/changeTriggeredPipeline.js';
import { uncertainObservation, type FrameSample, type GuidanceMessage } from '../src/contracts.js';
import type { ChangeEventEvidence } from '../src/eventVlm.js';

function frame(timestampMs: number): FrameSample {
  return {
    data: new Uint8Array([0, 0, 0, 255]),
    width: 1,
    height: 1,
    pixelFormat: 'rgba',
    timestampMs,
    participantIdentity: 'phone',
  };
}

describe('ChangeTriggeredGuidancePipeline', () => {
  it('sends bounded pre/post-roll evidence to the VLM only after a trigger', async () => {
    const detector: ChangeDetector = {
      id: 'fixture',
      version: '1',
      reset: vi.fn(async () => undefined),
      observe: vi.fn(async (sample: FrameSample) => ({
        detectorId: 'fixture',
        detectorVersion: '1',
        timestampMs: sample.timestampMs,
        score: sample.timestampMs === 1000 ? 1 : 0,
        changed: sample.timestampMs === 1000,
        latencyMs: 1,
      })),
    };
    const events: number[][] = [];
    const messages: GuidanceMessage[] = [];
    const pipeline = new ChangeTriggeredGuidancePipeline(
      detector,
      {
        observeEvent: vi.fn(async (event: ChangeEventEvidence) => {
          events.push(event.frames.map((sample) => sample.timestampMs));
          return uncertainObservation(event.trigger.timestampMs);
        }),
      },
      {
        evaluate: vi.fn(async () => ({
          decision: 'REQUEST_VISIBILITY' as const,
          decisionReason: 'Keep the work area visible.',
        })),
      },
      { publish: vi.fn(async (message) => void messages.push(message)) },
      { companyId: 'company', workflowId: 'workflow', deploymentId: 'deployment' },
      { preRollMs: 1000, postRollMs: 500, maxEvidenceFrames: 3 },
    );

    for (const timestampMs of [0, 500, 1000, 1500]) await pipeline.pushFrame(frame(timestampMs));

    expect(events).toEqual([[0, 1000, 1500]]);
    expect(messages).toEqual([
      { type: 'speak', text: 'Keep the work area visible.', priority: 'normal' },
    ]);
  });
});
