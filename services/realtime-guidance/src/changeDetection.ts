import { z } from 'zod';

import type { FrameSample } from './contracts.js';

export type ChangeDetection = {
  detectorId: string;
  detectorVersion: string;
  timestampMs: number;
  score: number;
  changed: boolean;
  latencyMs: number;
  metadata?: Record<string, string | number | boolean>;
};

export interface ChangeDetector {
  readonly id: string;
  readonly version: string;
  observe(frame: FrameSample): Promise<ChangeDetection>;
  reset(): Promise<void>;
}

export type FrameDifferenceDetectorOptions = {
  threshold?: number;
  consecutiveFrames?: number;
  targetSamples?: number;
  smoothing?: number;
};

/**
 * Dependency-free baseline used to validate the event pipeline and measure how
 * much a learned temporal model improves over raw visual change.
 */
export class FrameDifferenceDetector implements ChangeDetector {
  readonly id = 'frame-difference';
  readonly version = '1';

  private previous: Float32Array | undefined;
  private smoothedScore = 0;
  private aboveThreshold = 0;
  private readonly threshold: number;
  private readonly consecutiveFrames: number;
  private readonly targetSamples: number;
  private readonly smoothing: number;

  constructor(options: FrameDifferenceDetectorOptions = {}) {
    this.threshold = clamp(options.threshold ?? 0.12, 0, 1);
    this.consecutiveFrames = Math.max(1, Math.floor(options.consecutiveFrames ?? 2));
    this.targetSamples = Math.max(16, Math.floor(options.targetSamples ?? 4096));
    this.smoothing = clamp(options.smoothing ?? 0.35, 0, 1);
  }

  async observe(frame: FrameSample): Promise<ChangeDetection> {
    const startedAt = performance.now();
    const current = sampleLuma(frame, this.targetSamples);
    let rawScore = 0;
    if (this.previous?.length === current.length) {
      for (let index = 0; index < current.length; index += 1) {
        rawScore += Math.abs((current[index] ?? 0) - (this.previous[index] ?? 0));
      }
      rawScore /= current.length;
    }
    this.previous = current;
    this.smoothedScore =
      this.smoothedScore === 0
        ? rawScore
        : this.smoothing * rawScore + (1 - this.smoothing) * this.smoothedScore;
    this.aboveThreshold = this.smoothedScore >= this.threshold ? this.aboveThreshold + 1 : 0;

    return {
      detectorId: this.id,
      detectorVersion: this.version,
      timestampMs: frame.timestampMs,
      score: clamp(this.smoothedScore, 0, 1),
      changed: this.aboveThreshold >= this.consecutiveFrames,
      latencyMs: performance.now() - startedAt,
      metadata: { rawScore, threshold: this.threshold },
    };
  }

  async reset(): Promise<void> {
    this.previous = undefined;
    this.smoothedScore = 0;
    this.aboveThreshold = 0;
  }
}

const HttpDetectionSchema = z.object({
  score: z.number().min(0).max(1),
  changed: z.boolean(),
  modelId: z.string().min(1).optional(),
  modelVersion: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type HttpChangeDetectorOptions = {
  endpoint: string;
  detectorId: string;
  detectorVersion: string;
  streamId: string;
  bearerToken?: string;
};

/**
 * Provider-neutral streaming boundary intended for StreamFormer first, while
 * keeping ActionSwitch and future detectors interchangeable.
 */
export class HttpChangeDetector implements ChangeDetector {
  readonly id: string;
  readonly version: string;
  private sequence = 0;
  private generation = 0;

  constructor(private readonly options: HttpChangeDetectorOptions) {
    this.id = options.detectorId;
    this.version = options.detectorVersion;
  }

  async observe(frame: FrameSample): Promise<ChangeDetection> {
    const startedAt = performance.now();
    const response = await fetch(this.options.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.options.bearerToken
          ? { authorization: `Bearer ${this.options.bearerToken}` }
          : {}),
      },
      body: JSON.stringify({
        contract: 'vision-codef.change-detector-frame.v1',
        streamId: `${this.options.streamId}:${this.generation}`,
        sequence: this.sequence++,
        frame: serializeFrame(frame),
      }),
    });
    if (!response.ok) throw new Error(`Change detector request failed (${response.status}).`);
    const result = HttpDetectionSchema.parse(unwrapData(await response.json()));
    return {
      detectorId: result.modelId ?? this.id,
      detectorVersion: result.modelVersion ?? this.version,
      timestampMs: frame.timestampMs,
      score: result.score,
      changed: result.changed,
      latencyMs: performance.now() - startedAt,
      ...(result.metadata ? { metadata: result.metadata } : {}),
    };
  }

  async reset(): Promise<void> {
    this.sequence = 0;
    this.generation += 1;
  }
}

export function serializeFrame(frame: FrameSample) {
  return {
    width: frame.width,
    height: frame.height,
    pixelFormat: frame.pixelFormat,
    timestampMs: frame.timestampMs,
    participantIdentity: frame.participantIdentity,
    dataBase64: Buffer.from(frame.data).toString('base64'),
  };
}

function sampleLuma(frame: FrameSample, targetSamples: number): Float32Array {
  const pixelCount = frame.width * frame.height;
  const stride = Math.max(1, Math.floor(pixelCount / targetSamples));
  const samples = new Float32Array(Math.ceil(pixelCount / stride));
  let outputIndex = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4;
    const red = frame.data[offset] ?? 0;
    const green = frame.data[offset + 1] ?? 0;
    const blue = frame.data[offset + 2] ?? 0;
    samples[outputIndex++] = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  }
  return samples;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function unwrapData(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data: unknown }).data;
  }
  return value;
}
