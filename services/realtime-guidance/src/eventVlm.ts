import type { ChangeDetection } from './changeDetection.js';
import { serializeFrame } from './changeDetection.js';
import type { FrameSample } from './contracts.js';
import type { VlmContext, VlmProvider } from './vlm.js';
import { deflateSync } from 'node:zlib';
import { TechnicianStepObservationSchema } from './contracts.js';

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

/** Evaluates a small, low-detail frame sequence against one approved Golden Run step. */
export class OpenAiEventVlmProvider implements EventVlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = 'gpt-5-mini',
    private readonly request: typeof fetch = fetch,
  ) {}

  async observeEvent(event: ChangeEventEvidence, context: VlmContext): Promise<unknown> {
    if (!context.currentStep) throw new Error('Approved step context is required for task evaluation.');
    const frames = evenlySample(event.frames, 5).map((frame) => ({
      type: 'input_image',
      image_url: `data:image/png;base64,${Buffer.from(rgbaPng(frame)).toString('base64')}`,
      detail: 'low',
    }));
    const response = await this.request('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        store: false,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: evaluatorPrompt(context.currentStep) },
            ...frames,
          ],
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'technician_step_observation',
            strict: true,
            schema: {
              type: 'object', additionalProperties: false,
              properties: {
                timestampMs: { type: 'number' }, stepId: { type: 'string' },
                assessment: { type: 'string', enum: ['uncertain', 'in_progress', 'completed', 'deviation'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                observedAction: { type: 'string' }, evidence: { type: 'string' },
                deviationDetail: { type: ['string', 'null'] },
              },
              required: ['timestampMs', 'stepId', 'assessment', 'confidence', 'observedAction', 'evidence', 'deviationDetail'],
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI visual evaluation failed (${response.status}).`);
    const payload = await response.json() as Record<string, unknown>;
    const text = responseText(payload);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.deviationDetail === null) delete parsed.deviationDetail;
    parsed.timestampMs = event.trigger.timestampMs;
    parsed.stepId = context.currentStep.id;
    return TechnicianStepObservationSchema.parse(parsed);
  }
}

function evaluatorPrompt(step: NonNullable<VlmContext['currentStep']>): string {
  return `You are a conservative first-person industrial task observer. Compare the chronological frames only with the approved step below. Do not infer hidden actions. Return uncertain when hands, tool, object, start state, or end state are not clearly visible. Return completed only when visible evidence satisfies the completion check/end state. Return deviation only for a clearly visible conflict with a listed deviation rule or the approved action; ordinary progress is in_progress. Never write an instruction. Keep deviationDetail factual, specific, and under 20 words.\n\nAPPROVED STEP:\n${JSON.stringify(step)}`;
}

function responseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') return (part as { text: string }).text;
    }
  }
  throw new Error('OpenAI visual evaluation returned no structured output.');
}

function evenlySample<T>(values: T[], maximum: number): T[] {
  if (values.length <= maximum) return values;
  return Array.from({ length: maximum }, (_, index) => values[Math.round(index * (values.length - 1) / (maximum - 1))]!);
}

function rgbaPng(frame: FrameSample): Uint8Array {
  const stride = frame.width * 4;
  if (frame.data.length !== stride * frame.height) throw new Error('RGBA frame size is invalid.');
  const raw = Buffer.alloc((stride + 1) * frame.height);
  for (let row = 0; row < frame.height; row += 1) {
    raw[row * (stride + 1)] = 0;
    Buffer.from(frame.data.buffer, frame.data.byteOffset + row * stride, stride).copy(raw, row * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.from([frame.width >>> 24, frame.width >>> 16, frame.width >>> 8, frame.width, frame.height >>> 24, frame.height >>> 16, frame.height >>> 8, frame.height, 8, 6, 0, 0, 0])),
    pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
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
