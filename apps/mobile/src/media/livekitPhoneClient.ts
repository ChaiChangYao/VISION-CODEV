import {
  createLocalTracks,
  LocalAudioTrack,
  LocalVideoTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from 'livekit-client';

import type { FacingMode } from '../types';

export type LiveKitTokenProvider = () => Promise<string>;
export const GUIDANCE_DATA_TOPIC = 'vision-codef.guidance';

export type GuidanceMessage =
  | { type: 'speak'; text: string; priority?: 'normal' | 'urgent' }
  | { type: 'interrupt' };

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
  onGuidanceAudioChanged?: (active: boolean) => void;
  onGuidanceMessage?: (message: GuidanceMessage) => void;
  receiveGuidanceAudio?: boolean;
  onError?: (error: Error) => void;
};

export class LiveKitPhoneClient {
  private readonly options: LiveKitPhoneClientOptions;
  private room: Room | undefined;
  private localVideo: LocalVideoTrack | undefined;
  private localAudio: LocalAudioTrack | undefined;
  private readonly guidanceAudioTracks = new Set<string>();
  private facingMode: FacingMode;
  private suppressDisconnectEvent = false;

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
        // Guidance is explicitly selected by participant role below. This
        // prevents the desktop monitor from being received on the phone.
        autoSubscribe: false,
      });
      this.subscribeToAvailableGuidance(room);
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

  async disconnect(silent = false): Promise<void> {
    this.suppressDisconnectEvent = silent;
    const room = this.room;
    this.room = undefined;
    this.localVideo = undefined;
    this.localAudio = undefined;
    this.guidanceAudioTracks.clear();
    this.options.onGuidanceAudioChanged?.(false);
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
    room.on(RoomEvent.Disconnected, (reason) => {
      this.guidanceAudioTracks.clear();
      this.options.onGuidanceAudioChanged?.(false);
      if (this.suppressDisconnectEvent) {
        this.suppressDisconnectEvent = false;
        return;
      }
      this.options.onDisconnected?.(String(reason ?? 'unknown'));
    });
    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      if (this.options.receiveGuidanceAudio !== false && isGuidanceAudioPublication(publication, participant)) {
        publication.setSubscribed(true);
      }
    });
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (!isGuidanceAudioTrack(track, publication, participant)) return;
      this.guidanceAudioTracks.add(publication.trackSid);
      this.options.onGuidanceAudioChanged?.(true);
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      if (!isGuidanceParticipant(participant)) return;
      this.guidanceAudioTracks.delete(publication.trackSid);
      this.options.onGuidanceAudioChanged?.(this.guidanceAudioTracks.size > 0);
    });
    room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (!participant || !isGuidanceParticipant(participant) || topic !== GUIDANCE_DATA_TOPIC) return;
      const message = parseGuidanceMessage(payload);
      if (message) this.options.onGuidanceMessage?.(message);
    });
  }

  private subscribeToAvailableGuidance(room: Room): void {
    if (this.options.receiveGuidanceAudio === false) return;
    for (const participant of room.remoteParticipants.values()) {
      if (!isGuidanceParticipant(participant)) continue;
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind === Track.Kind.Audio) publication.setSubscribed(true);
      }
    }
  }
}

export function isGuidanceParticipant(participant: Pick<RemoteParticipant, 'attributes'>): boolean {
  return participant.attributes.role === 'guidance';
}

export function isGuidanceAudioPublication(
  publication: Pick<RemoteTrackPublication, 'kind'>,
  participant: Pick<RemoteParticipant, 'attributes'>,
): boolean {
  return publication.kind === Track.Kind.Audio && isGuidanceParticipant(participant);
}

export function isGuidanceAudioTrack(
  track: Pick<RemoteTrack, 'kind'>,
  publication: Pick<RemoteTrackPublication, 'kind'>,
  participant: Pick<RemoteParticipant, 'attributes'>,
): boolean {
  return track.kind === Track.Kind.Audio && isGuidanceAudioPublication(publication, participant);
}

export function parseGuidanceMessage(payload: Uint8Array): GuidanceMessage | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload));
    if (typeof value !== 'object' || value === null) return undefined;
    const message = value as Record<string, unknown>;
    if (message.type === 'interrupt') return { type: 'interrupt' };
    if (
      message.type === 'speak' &&
      typeof message.text === 'string' &&
      message.text.trim().length > 0 &&
      (message.priority === undefined || message.priority === 'normal' || message.priority === 'urgent')
    ) {
      return { type: 'speak', text: message.text.trim(), ...(message.priority ? { priority: message.priority } : {}) };
    }
  } catch {
    // Invalid packets are ignored; only the trusted guidance service can control speech.
  }
  return undefined;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
