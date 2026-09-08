export type GuidancePriority = 'normal' | 'urgent';

export type GuidanceSpeaker = {
  prepare(): Promise<void>;
  speak(text: string, options?: { priority?: GuidancePriority; speed?: number }): Promise<void>;
  interrupt(): Promise<void>;
  isSpeaking(): boolean;
  subscribe(listener: () => void): () => void;
  dispose(): Promise<void>;
};

export type StreamingGuidanceEngine = {
  getSampleRate(): Promise<number>;
  startPcmPlayer(sampleRate: number, channels: number): Promise<void>;
  writePcmChunk(samples: number[]): Promise<void>;
  stopPcmPlayer(): Promise<void>;
  generateSpeechStream(
    text: string,
    options: { speed?: number } | undefined,
    handlers: {
      onChunk?: (chunk: { samples: number[]; sampleRate: number }) => void;
      onEnd?: () => void;
      onError?: (event: { message: string }) => void;
    },
  ): Promise<{ cancel(): Promise<void> }>;
  cancelSpeechStream(): Promise<void>;
  destroy(): Promise<void>;
};

/**
 * Keeps spoken guidance local to the phone. A newer instruction always replaces
 * an older one, so a technician never hears stale recovery advice.
 */
export class LocalGuidanceSpeaker implements GuidanceSpeaker {
  private engine: StreamingGuidanceEngine | undefined;
  private initialization: Promise<StreamingGuidanceEngine> | undefined;
  private activeRequest = 0;
  private speaking = false;
  private disposed = false;
  private writeTail: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly createEngine: () => Promise<StreamingGuidanceEngine>) {}

  async prepare(): Promise<void> {
    await this.getEngine();
  }

  async speak(
    text: string,
    options: { priority?: GuidancePriority; speed?: number } = {},
  ): Promise<void> {
    const message = text.trim();
    if (!message) return;
    if (this.disposed) throw new Error('Local guidance speaker has been disposed.');

    const request = ++this.activeRequest;
    await this.stopActiveSpeech();
    const engine = await this.getEngine();
    if (request !== this.activeRequest) return;

    const sampleRate = await engine.getSampleRate();
    await engine.startPcmPlayer(sampleRate, 1);
    this.setSpeaking(true);

    const finish = () => {
      if (request !== this.activeRequest) return;
      void this.writeTail.finally(() => engine.stopPcmPlayer()).finally(() => this.setSpeaking(false));
    };

    const controller = await engine.generateSpeechStream(message, { speed: options.speed }, {
      onChunk: (chunk) => {
        if (request !== this.activeRequest) return;
        this.writeTail = this.writeTail.then(() => engine.writePcmChunk(chunk.samples));
      },
      onEnd: finish,
      onError: finish,
    });

    if (request !== this.activeRequest) await controller.cancel();
  }

  async interrupt(): Promise<void> {
    ++this.activeRequest;
    await this.stopActiveSpeech();
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.interrupt();
    const engine = this.engine;
    this.engine = undefined;
    this.initialization = undefined;
    await engine?.destroy();
  }

  private async getEngine(): Promise<StreamingGuidanceEngine> {
    if (this.engine) return this.engine;
    this.initialization ??= this.createEngine().then((engine) => {
      this.engine = engine;
      return engine;
    });
    try {
      return await this.initialization;
    } catch (error) {
      this.initialization = undefined;
      throw error;
    }
  }

  private async stopActiveSpeech(): Promise<void> {
    const engine = this.engine;
    if (!engine) return;
    await engine.cancelSpeechStream();
    await this.writeTail.catch(() => undefined);
    await engine.stopPcmPlayer();
    this.setSpeaking(false);
  }

  private setSpeaking(speaking: boolean): void {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    for (const listener of this.listeners) listener();
  }
}
