import type { ChangeDetection } from './changeDetection.js';
import { serializeFrame } from './changeDetection.js';
import type { FrameSample } from './contracts.js';
import type { VlmContext, VlmProvider } from './vlm.js';

export type ChangeEventEvidence = {
  trigger: ChangeDetection;
  frames: FrameSample[];
  windowStartMs: number;
  windowEndMs: number;
};

export interface EventVlmProvider {
  observeEvent(event: ChangeEventEvidence, context: VlmContext): Promise<unknown>;
}

/** Compatibility adapter for existing single-frame providers. */
export class SingleFrameEventVlmProvider implements EventVlmProvider {
  constructor(private readonly provider: VlmProvider) {}

  async observeEvent(event: ChangeEventEvidence, context: VlmContext): Promise<unknown> {
    const frame = nearestFrame(event.frames, event.trigger.timestampMs);
    if (!frame) throw new Error('A change event must contain at least one evidence frame.');
    return this.provider.observe(frame, context);
  }
}

/** Sends one bounded evidence packet rather than a continuous camera stream. */
export class HttpEventVlmProvider implements EventVlmProvider {
  constructor(
    private readonly endpoint: string,
    private readonly bearerToken?: string,
  ) {}

  async observeEvent(event: ChangeEventEvidence, context: VlmContext): Promise<unknown> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}),
      },
      body: JSON.stringify({
        contract: 'vision-codef.change-event-observation.v1',
        context,
        trigger: event.trigger,
        windowStartMs: event.windowStartMs,
        windowEndMs: event.windowEndMs,
        frames: event.frames.map(serializeFrame),
      }),
    });
    if (!response.ok) throw new Error(`Event VLM request failed (${response.status}).`);
    return unwrapData(await response.json());
  }
}

function nearestFrame(frames: FrameSample[], timestampMs: number): FrameSample | undefined {
  return frames.reduce<FrameSample | undefined>((nearest, frame) => {
    if (!nearest) return frame;
    return Math.abs(frame.timestampMs - timestampMs) < Math.abs(nearest.timestampMs - timestampMs)
      ? frame
      : nearest;
  }, undefined);
}

function unwrapData(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data: unknown }).data;
  }
  return value;
}
