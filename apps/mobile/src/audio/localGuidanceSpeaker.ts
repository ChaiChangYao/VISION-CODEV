export type GuidancePriority = 'normal' | 'urgent';

export type GuidanceSpeaker = {
  prepare(): Promise<void>;
  speak(text: string, options?: { priority?: GuidancePriority; speed?: number }): Promise<void>;
  interrupt(): Promise<void>;
  isSpeaking(): boolean;
  subscribe(listener: () => void): () => void;
  dispose(): Promise<void>;
};

export type GeneratedGuidanceAudio = {
  samples: number[];
  sampleRate: number;
};

export type LocalGuidanceEngine = {
  generateSpeech(text: string, options?: { speed?: number }): Promise<GeneratedGuidanceAudio>;
  startPcmPlayer(sampleRate: number, channels: number): Promise<void>;
  writePcmChunk(samples: number[]): Promise<void>;
  stopPcmPlayer(): Promise<void>;
  destroy(): Promise<void>;
};

const PCM_CHUNK_SIZE = 8_192;

/**
 * Keeps spoken guidance local to the phone. Speech is synthesized in one safe
 * native call, then played through Android's PCM player. A newer instruction
 * always replaces an older one, so stale recovery advice is never played.
 */
export class LocalGuidanceSpeaker implements GuidanceSpeaker {
  private engine: LocalGuidanceEngine | undefined;
  private initialization: Promise<LocalGuidanceEngine> | undefined;
  private generationTail: Promise<void> = Promise.resolve();
  private activeRequest = 0;
  private cancelPlaybackWait: (() => void) | undefined;
  private speaking = false;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly createEngine: () => Promise<LocalGuidanceEngine>) {}

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

    const audio = await this.generateInOrder(engine, message, options.speed);
    if (request !== this.activeRequest || this.disposed) return;
    if (!audio.samples.length || !Number.isFinite(audio.sampleRate) || audio.sampleRate <= 0) return;

    const playbackStartedAt = Date.now();
    await engine.startPcmPlayer(audio.sampleRate, 1);
    this.setSpeaking(true);

    try {
      for (let offset = 0; offset < audio.samples.length; offset += PCM_CHUNK_SIZE) {
        if (request !== this.activeRequest) return;
        await engine.writePcmChunk(audio.samples.slice(offset, offset + PCM_CHUNK_SIZE));
      }

      const audioDurationMs = (audio.samples.length / audio.sampleRate) * 1_000;
      const remainingMs = Math.max(0, audioDurationMs - (Date.now() - playbackStartedAt));
      await this.waitForPlayback(remainingMs + 80, request);
    } finally {
      if (request === this.activeRequest) {
        await engine.stopPcmPlayer();
        this.setSpeaking(false);
      }
    }
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

  private async getEngine(): Promise<LocalGuidanceEngine> {
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

  private async generateInOrder(
    engine: LocalGuidanceEngine,
    text: string,
    speed?: number,
  ): Promise<GeneratedGuidanceAudio> {
    let resolveAudio!: (audio: GeneratedGuidanceAudio) => void;
    let rejectAudio!: (error: unknown) => void;
    const result = new Promise<GeneratedGuidanceAudio>((resolve, reject) => {
      resolveAudio = resolve;
      rejectAudio = reject;
    });
    this.generationTail = this.generationTail
      .catch(() => undefined)
      .then(async () => {
        try {
          resolveAudio(await engine.generateSpeech(text, { speed }));
        } catch (error) {
          rejectAudio(error);
        }
      });
    return result;
  }

  private waitForPlayback(durationMs: number, request: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        if (this.cancelPlaybackWait === finish) this.cancelPlaybackWait = undefined;
        resolve();
      };
      const timer = setTimeout(finish, durationMs);
      if (request !== this.activeRequest) finish();
      else this.cancelPlaybackWait = finish;
    });
  }

  private async stopActiveSpeech(): Promise<void> {
    this.cancelPlaybackWait?.();
    this.cancelPlaybackWait = undefined;
    const engine = this.engine;
    if (engine) await engine.stopPcmPlayer();
    this.setSpeaking(false);
  }

  private setSpeaking(speaking: boolean): void {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    for (const listener of this.listeners) listener();
  }
}
