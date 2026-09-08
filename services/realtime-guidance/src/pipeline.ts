import {
  PaperCraneObservationSchema,
  uncertainObservation,
  type FrameSample,
  type GuidanceDecision,
  type GuidanceMessage,
  type PaperCraneObservation,
} from './contracts.js';
import type { VlmContext, VlmProvider } from './vlm.js';

export interface ObservationEvaluator {
  evaluate(observation: PaperCraneObservation): Promise<GuidanceDecision>;
}

export interface GuidancePublisher {
  publish(message: GuidanceMessage): Promise<void>;
}

export type PipelineOptions = {
  repeatGuidanceAfterMs?: number;
  onError?: (error: unknown) => void;
};

export class RealtimeGuidancePipeline {
  private pendingFrame: FrameSample | undefined;
  private drainPromise: Promise<void> | undefined;
  private lastGuidanceKey = '';
  private lastGuidanceAt = 0;

  constructor(
    private readonly vlm: VlmProvider,
    private readonly evaluator: ObservationEvaluator,
    private readonly publisher: GuidancePublisher,
    private readonly context: VlmContext,
    private readonly options: PipelineOptions = {},
  ) {}

  pushFrame(frame: FrameSample): Promise<void> {
    this.pendingFrame = frame;
    this.drainPromise ??= this.drain();
    return this.drainPromise;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pendingFrame) {
        const frame = this.pendingFrame;
        this.pendingFrame = undefined;
        await this.process(frame);
      }
    } finally {
      this.drainPromise = undefined;
      if (this.pendingFrame) this.drainPromise = this.drain();
    }
  }

  private async process(frame: FrameSample): Promise<void> {
    try {
      let observation: PaperCraneObservation;
      try {
        const output = await this.vlm.observe(frame, this.context);
        observation = PaperCraneObservationSchema.parse(output);
      } catch (error) {
        this.options.onError?.(error);
        observation = uncertainObservation(frame.timestampMs);
      }
      const decision = await this.evaluator.evaluate(observation);
      await this.publishDecision(decision);
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private async publishDecision(decision: GuidanceDecision): Promise<void> {
    if (decision.decision === 'WAIT') return;
    if (decision.decision === 'INTERRUPT') {
      await this.publisher.publish({ type: 'interrupt' });
      await this.publishSpeech(
        decision.intervention?.detail ?? decision.decisionReason,
        'urgent',
      );
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
    await this.publisher.publish({ type: 'speak', text, priority });
  }
}
