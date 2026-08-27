/**
 * Vision Codef deliberately does not promise camera capture while the app is
 * backgrounded or the device screen is locked. The capture session must be
 * active and the app must be foregrounded before this lifecycle publishes.
 */
export const BACKGROUND_CAMERA_CAPTURE_SUPPORTED = false as const;

export type ForegroundState = 'active' | 'background';
export type PublisherTrackKind = 'camera' | 'microphone';
export type PublisherLifecycleState =
  | 'idle'
  | 'connecting'
  | 'publishing'
  | 'paused'
  | 'reconnecting'
  | 'disconnected'
  | 'failed'
  | 'stopped';

export type PublisherTracks<Track = unknown> = {
  camera: Track;
  microphone: Track;
};

export type ConnectionEvent =
  | { type: 'connected' }
  | { type: 'reconnecting' }
  | { type: 'reconnected' }
  | { type: 'disconnected'; reason?: string };

/** The only LiveKit surface the lifecycle needs; native/client details stay behind it. */
export interface LiveKitPublisherBoundary<Track = unknown> {
  connect(serverUrl: string, token: string): Promise<void>;
  createLocalTracks(): Promise<PublisherTracks<Track>>;
  publishTrack(track: Track, kind: PublisherTrackKind): Promise<void>;
  stopTrack(track: Track): Promise<void> | void;
  disconnect(): Promise<void> | void;
  subscribeConnectionEvents(listener: (event: ConnectionEvent) => void): () => void;
}

export type PublisherSnapshot = {
  state: PublisherLifecycleState;
  foreground: ForegroundState;
  sessionActive: boolean;
  cameraPublished: boolean;
  microphonePublished: boolean;
  error?: string;
};

export type PublisherLifecycleOptions<Track = unknown> = {
  serverUrl: string;
  getToken: () => Promise<string>;
  boundary: LiveKitPublisherBoundary<Track>;
  foreground?: ForegroundState;
  sessionActive?: boolean;
  onSnapshot?: (snapshot: PublisherSnapshot) => void;
  onConnectionEvent?: (event: ConnectionEvent) => void;
};

export class PublisherGateError extends Error {
  readonly code: 'SESSION_INACTIVE' | 'APP_NOT_FOREGROUNDED';

  constructor(code: PublisherGateError['code']) {
    super(
      code === 'SESSION_INACTIVE'
        ? 'The capture session is not active.'
        : 'Camera and microphone publishing requires the app to be foregrounded.',
    );
    this.name = 'PublisherGateError';
    this.code = code;
  }
}

/**
 * Coordinates the session gate and the LiveKit publisher. This class owns no
 * timers and does not reconnect in the background; the host explicitly moves
 * the lifecycle back to the foreground and may then reconnect.
 */
export class LiveKitPublisherLifecycle<Track = unknown> {
  private readonly options: PublisherLifecycleOptions<Track>;
  private readonly unsubscribeConnectionEvents: () => void;
  private state: PublisherLifecycleState = 'idle';
  private foreground: ForegroundState;
  private sessionActive: boolean;
  private desiredPublishing = false;
  private cameraPublished = false;
  private microphonePublished = false;
  private expectedDisconnect = false;
  private operation: Promise<void> | undefined;
  private error: string | undefined;

  constructor(options: PublisherLifecycleOptions<Track>) {
    this.options = options;
    this.foreground = options.foreground ?? 'active';
    this.sessionActive = options.sessionActive ?? false;
    this.unsubscribeConnectionEvents = options.boundary.subscribeConnectionEvents(
      (event) => this.handleConnectionEvent(event),
    );
  }

  snapshot(): PublisherSnapshot {
    return {
      state: this.state,
      foreground: this.foreground,
      sessionActive: this.sessionActive,
      cameraPublished: this.cameraPublished,
      microphonePublished: this.microphonePublished,
      ...(this.error ? { error: this.error } : {}),
    };
  }

  async start(): Promise<void> {
    this.assertCanPublish();
    this.sessionActive = true;
    this.desiredPublishing = true;
    await this.connectAndPublish();
  }

  async setSessionActive(active: boolean): Promise<void> {
    this.sessionActive = active;
    if (!active) {
      this.desiredPublishing = false;
      await this.disconnect('session ended', 'stopped');
      return;
    }

    this.desiredPublishing = true;
    if (this.foreground === 'active') await this.connectAndPublish();
    else this.setState('paused');
  }

  async setForeground(state: ForegroundState): Promise<void> {
    if (this.foreground === state) return;
    this.foreground = state;

    if (state === 'background') {
      if (this.state === 'publishing' || this.state === 'connecting' || this.state === 'reconnecting') {
        this.expectedDisconnect = true;
        await this.options.boundary.disconnect();
        this.expectedDisconnect = false;
        this.cameraPublished = false;
        this.microphonePublished = false;
        if (this.sessionActive && this.desiredPublishing) this.setState('paused');
      }
      return;
    }

    if (this.sessionActive && this.desiredPublishing && this.state === 'paused') {
      await this.connectAndPublish();
    }
  }

  async reconnect(): Promise<void> {
    this.assertCanPublish();
    this.desiredPublishing = true;
    await this.connectAndPublish();
  }

  async stop(): Promise<void> {
    this.sessionActive = false;
    this.desiredPublishing = false;
    await this.disconnect('stopped', 'stopped');
  }

  dispose(): void {
    this.unsubscribeConnectionEvents();
    this.desiredPublishing = false;
    this.sessionActive = false;
    this.expectedDisconnect = true;
    void this.options.boundary.disconnect();
    this.expectedDisconnect = false;
  }

  private async connectAndPublish(): Promise<void> {
    this.assertCanPublish();
    if (this.state === 'publishing') return;
    if (this.operation) return this.operation;

    this.operation = this.connectAndPublishInternal().finally(() => {
      this.operation = undefined;
    });
    return this.operation;
  }

  private async connectAndPublishInternal(): Promise<void> {
    this.error = undefined;
    this.setState('connecting');
    try {
      await this.options.boundary.connect(this.options.serverUrl, await this.options.getToken());
      const tracks = await this.options.boundary.createLocalTracks();

      await this.options.boundary.publishTrack(tracks.camera, 'camera');
      this.cameraPublished = true;
      this.emit();

      await this.options.boundary.publishTrack(tracks.microphone, 'microphone');
      this.microphonePublished = true;
      this.setState('publishing');
    } catch (error) {
      this.error = toError(error).message;
      this.cameraPublished = false;
      this.microphonePublished = false;
      this.expectedDisconnect = true;
      await this.options.boundary.disconnect();
      this.expectedDisconnect = false;
      this.setState('failed');
      throw error;
    }
  }

  private async disconnect(reason: string, nextState: PublisherLifecycleState): Promise<void> {
    this.expectedDisconnect = true;
    await this.options.boundary.disconnect();
    this.expectedDisconnect = false;
    this.cameraPublished = false;
    this.microphonePublished = false;
    this.error = undefined;
    this.setState(nextState);
    this.options.onConnectionEvent?.({ type: 'disconnected', reason });
  }

  private handleConnectionEvent(event: ConnectionEvent): void {
    this.options.onConnectionEvent?.(event);
    if (event.type === 'reconnecting') {
      this.setState('reconnecting');
    } else if (event.type === 'reconnected') {
      if (this.sessionActive && this.foreground === 'active' && this.cameraPublished && this.microphonePublished) {
        this.setState('publishing');
      }
    } else if (event.type === 'connected') {
      this.emit();
    } else if (!this.expectedDisconnect) {
      this.cameraPublished = false;
      this.microphonePublished = false;
      this.setState('disconnected');
    }
  }

  private assertCanPublish(): void {
    if (!this.sessionActive) throw new PublisherGateError('SESSION_INACTIVE');
    if (this.foreground !== 'active') throw new PublisherGateError('APP_NOT_FOREGROUNDED');
  }

  private setState(state: PublisherLifecycleState): void {
    this.state = state;
    this.emit();
  }

  private emit(): void {
    this.options.onSnapshot?.(this.snapshot());
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
