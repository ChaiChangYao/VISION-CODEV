import {
  createLocalTracks,
  type LocalAudioTrack,
  type LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from 'livekit-client';

import type {
  ConnectionEvent,
  LiveKitPublisherBoundary,
  PublisherTracks,
} from './publisherLifecycle';

export type LiveKitPublisherTrack = LocalAudioTrack | LocalVideoTrack;

/**
 * Production boundary for the phone publisher. LiveKit owns the WebRTC
 * transport; the lifecycle controller owns when this boundary may be used.
 */
export function createLiveKitPublisherBoundary(): LiveKitPublisherBoundary<LiveKitPublisherTrack> {
  let room: Room | undefined;
  let listener: ((event: ConnectionEvent) => void) | undefined;

  return {
    async connect(serverUrl, token) {
      room = new Room({
        adaptiveStream: { pixelDensity: 'screen' },
        dynacast: true,
        publishDefaults: {
          simulcast: true,
          videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        },
      });
      room.on(RoomEvent.Connected, () => listener?.({ type: 'connected' }));
      room.on(RoomEvent.Reconnecting, () => listener?.({ type: 'reconnecting' }));
      room.on(RoomEvent.Reconnected, () => listener?.({ type: 'reconnected' }));
      room.on(RoomEvent.Disconnected, (reason) =>
        listener?.({ type: 'disconnected', reason: String(reason ?? 'unknown') }),
      );
      await room.connect(serverUrl, token, { autoSubscribe: false });
    },

    async createLocalTracks(): Promise<PublisherTracks<LiveKitPublisherTrack>> {
      const tracks = await createLocalTracks({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: {
          facingMode: 'environment',
          resolution: VideoPresets.h720.resolution,
        },
      });
      const camera = tracks.find((track) => track.kind === Track.Kind.Video) as
        | LocalVideoTrack
        | undefined;
      const microphone = tracks.find((track) => track.kind === Track.Kind.Audio) as
        | LocalAudioTrack
        | undefined;
      if (!camera || !microphone) {
        for (const track of tracks) track.stop();
        throw new Error('LiveKit did not create both camera and microphone tracks.');
      }
      return { camera, microphone };
    },

    async publishTrack(track, kind) {
      if (!room) throw new Error('LiveKit room is not connected.');
      await room.localParticipant.publishTrack(track, {
        source: kind === 'camera' ? Track.Source.Camera : Track.Source.Microphone,
      });
    },

    stopTrack(track) {
      track.stop();
    },

    disconnect() {
      room?.disconnect(true);
      room = undefined;
    },

    subscribeConnectionEvents(nextListener) {
      listener = nextListener;
      return () => {
        if (listener === nextListener) listener = undefined;
      };
    },
  };
}
