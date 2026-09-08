import type { ChangeDetection, ChangeDetector } from './changeDetection.js';
import {
  PaperCraneObservationSchema,
  uncertainObservation,
  type FrameSample,
  type GuidanceDecision,
  type GuidanceMessage,
  type PaperCraneObservation,
} from './contracts.js';
import type { ChangeEventEvidence, EventVlmProvider } from './eventVlm.js';
import type { GuidancePublisher, ObservationEvaluator } from './pipeline.js';
import type { VlmContext } from './vlm.js';

export type ChangeTriggeredPipelineOptions = {
  preRollMs?: number;
  postRollMs?: number;
  cooldownMs?: number;
  maxEvidenceFrames?: number;
  repeatGuidanceAfterMs?: number;
  onDetection?: (detection: ChangeDetection) => void;
  onEvent?: (event: ChangeEventEvidence) => void;
  onError?: (error: unknown) => void;
};

type PendingEvent = { trigger: ChangeDetection };

export class ChangeTriggeredGuidancePipeline {
  private readonly buffer: FrameSample[] = [];
  private pendingEvent: PendingEvent | undefined;
  private pendingFrame: FrameSample | undefined;
  private drainPromise: Promise<void> | undefined;
  private nextTriggerAt = 0;
  private lastGuidanceKey = '';
  private lastGuidanceAt = 0;

  constructor(
    private readonly detector: ChangeDetector,
    private readonly vlm: EventVlmProvider,
    private readonly evaluator: ObservationEvaluator,
    private readonly publisher: GuidancePublisher,
    private readonly context: VlmContext,
    private readonly options: ChangeTriggeredPipelineOptions = {},
  ) {}

  pushFrame(frame: FrameSample): Promise<void> {
    this.pendingFrame = frame;
    this.drainPromise ??= this.drain();
    return this.drainPromise;
  }

  async flush(): Promise<void> {
    await this.drainPromise;
    if (this.pendingEvent && this.buffer.length > 0) await this.processPendingEvent();
  }

  async reset(): Promise<void> {
    await this.drainPromise;
    this.buffer.length = 0;
    this.pendingEvent = undefined;
    this.nextTriggerAt = 0;
    await this.detector.reset();
  }

  private async drain(): Promise<void> {
    try {
      while (this.pendingFrame) {
        const frame = this.pendingFrame;
        this.pendingFrame = undefined;
        await this.processFrame(frame);
      }
    } finally {
      this.drainPromise = undefined;
      if (this.pendingFrame) this.drainPromise = this.drain();
    }
  }

  private async processFrame(frame: FrameSample): Promise<void> {
    this.buffer.push(frame);
    this.trimBuffer(frame.timestampMs);

    if (
      this.pendingEvent &&
      frame.timestampMs >= this.pendingEvent.trigger.timestampMs + (this.options.postRollMs ?? 1000)
    ) {
      await this.processPendingEvent();
    }

    try {
      const detection = await this.detector.observe(frame);
      this.options.onDetection?.(detection);
      if (detection.changed && !this.pendingEvent && detection.timestampMs >= this.nextTriggerAt) {
        this.pendingEvent = { trigger: detection };
        this.nextTriggerAt = detection.timestampMs + (this.options.cooldownMs ?? 2000);
      }
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private trimBuffer(nowMs: number): void {
    const keepAfter = nowMs - (this.options.preRollMs ?? 2000) - (this.options.postRollMs ?? 1000);
    while ((this.buffer[0]?.timestampMs ?? Number.POSITIVE_INFINITY) < keepAfter) {
      this.buffer.shift();
    }
  }

  private async processPendingEvent(): Promise<void> {
    const pending = this.pendingEvent;
    if (!pending) return;
    this.pendingEvent = undefined;
    const preRollMs = this.options.preRollMs ?? 2000;
    const postRollMs = this.options.postRollMs ?? 1000;
    const windowStartMs = Math.max(0, pending.trigger.timestampMs - preRollMs);
    const windowEndMs = pending.trigger.timestampMs + postRollMs;
    const candidates = this.buffer.filter(
      (frame) => frame.timestampMs >= windowStartMs && frame.timestampMs <= windowEndMs,
    );
    const event: ChangeEventEvidence = {
      trigger: pending.trigger,
      frames: evenlySample(candidates, this.options.maxEvidenceFrames ?? 8),
      windowStartMs,
      windowEndMs,
    };
    if (event.frames.length === 0) return;
    this.options.onEvent?.(event);

    let observation: PaperCraneObservation;
    try {
      observation = PaperCraneObservationSchema.parse(
        await this.vlm.observeEvent(event, this.context),
      );
    } catch (error) {
      this.options.onError?.(error);
      observation = uncertainObservation(pending.trigger.timestampMs);
    }

    try {
      await this.publishDecision(await this.evaluator.evaluate(observation));
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private async publishDecision(decision: GuidanceDecision): Promise<void> {
    if (decision.decision === 'WAIT') return;
    if (decision.decision === 'INTERRUPT') {
      await this.publisher.publish({ type: 'interrupt' });
      await this.publishSpeech(decision.intervention?.detail ?? decision.decisionReason, 'urgent');
      return;
    }
    const text =
      decision.decision === 'REQUEST_VISIBILITY'
        ? decision.decisionReason
        : decision.currentInstruction;
    if (text) await this.publishSpeech(text, 'normal');
  }

  private async publishSpeech(text: string, priority: 'normal' | 'urgent'): Promise<void> {
    const now = Date.now();
    const key = `${priority}:${text}`;
    const repeatAfter = this.options.repeatGuidanceAfterMs ?? 3000;
    if (key === this.lastGuidanceKey && now - this.lastGuidanceAt < repeatAfter) return;
    this.lastGuidanceKey = key;
    this.lastGuidanceAt = now;
    const message: GuidanceMessage = { type: 'speak', text, priority };
    await this.publisher.publish(message);
  }
}

function evenlySample(frames: FrameSample[], maximum: number): FrameSample[] {
  if (frames.length <= maximum) return [...frames];
  const selected: FrameSample[] = [];
  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.round((index * (frames.length - 1)) / (maximum - 1));
    const frame = frames[sourceIndex];
    if (frame) selected.push(frame);
  }
  return selected;
}
