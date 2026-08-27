import {
  createLocalTracks,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from 'livekit-client';

import type { FacingMode } from '../types';

export type LiveKitTokenProvider = () => Promise<string>;

export type LiveKitPhoneClientOptions = {
  serverUrl: string;
  sessionId?: string;
  getToken: LiveKitTokenProvider;
  facingMode?: FacingMode;
  onConnected?: () => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onDisconnected?: (reason?: string) => void;
  onTrackPublished?: (kind: 'audio' | 'video') => void;
  onError?: (error: Error) => void;
};

export class LiveKitPhoneClient {
  private readonly options: LiveKitPhoneClientOptions;
  private room: Room | undefined;
  private localVideo: LocalVideoTrack | undefined;
  private localAudio: LocalAudioTrack | undefined;
  private facingMode: FacingMode;

  constructor(options: LiveKitPhoneClientOptions) {
    this.options = options;
    this.facingMode = options.facingMode ?? 'rear';
  }

  get isConnected(): boolean {
    return this.room?.state === 'connected';
  }

  async connect(): Promise<void> {
    if (this.room) return;

    const room = new Room({
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      publishDefaults: {
        simulcast: true,
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      },
    });
    this.room = room;
    this.registerRoomListeners(room);

    try {
      await room.connect(this.options.serverUrl, await this.options.getToken(), {
        autoSubscribe: false,
      });
      const tracks = await createLocalTracks({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: {
          facingMode: this.facingMode === 'rear' ? 'environment' : 'user',
          resolution: VideoPresets.h720.resolution,
        },
      });

      for (const track of tracks) {
        await room.localParticipant.publishTrack(track, {
          source: track.kind === Track.Kind.Video ? Track.Source.Camera : Track.Source.Microphone,
        });
        if (track.kind === Track.Kind.Video) {
          this.localVideo = track as LocalVideoTrack;
          this.options.onTrackPublished?.('video');
        } else {
          this.localAudio = track as LocalAudioTrack;
          this.options.onTrackPublished?.('audio');
        }
      }
    } catch (error) {
      this.room = undefined;
      this.options.onError?.(toError(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const room = this.room;
    this.room = undefined;
    this.localVideo = undefined;
    this.localAudio = undefined;
    room?.disconnect(true);
  }

  async switchCamera(): Promise<FacingMode> {
    if (!this.localVideo) return this.facingMode;
    this.facingMode = this.facingMode === 'rear' ? 'front' : 'rear';
    await this.localVideo.restartTrack({
      facingMode: this.facingMode === 'rear' ? 'environment' : 'user',
      resolution: VideoPresets.h720.resolution,
    });
    return this.facingMode;
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.room?.localParticipant.setMicrophoneEnabled(enabled);
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    await this.room?.localParticipant.setCameraEnabled(enabled, {
      facingMode: this.facingMode === 'rear' ? 'environment' : 'user',
      resolution: VideoPresets.h720.resolution,
    });
  }

  notifyAudioInterruptionEnded(): void {
    // Native AVAudioSession/Android audio-route observers call this when the
    // communication route is available again.
    void this.room?.startAudio();
  }

  private registerRoomListeners(room: Room): void {
    room.on(RoomEvent.Connected, () => this.options.onConnected?.());
    room.on(RoomEvent.Reconnecting, () => this.options.onReconnecting?.());
    room.on(RoomEvent.Reconnected, () => this.options.onReconnected?.());
    room.on(RoomEvent.Disconnected, (reason) =>
      this.options.onDisconnected?.(String(reason ?? 'unknown')),
    );
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
