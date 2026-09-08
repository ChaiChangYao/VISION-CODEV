import {
  RemoteVideoTrack,
  Room,
  RoomEvent,
  TrackSource,
  VideoBufferType,
  VideoStream,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from '@livekit/rtc-node';

import type { FrameSample, GuidanceConnection, GuidanceMessage } from './contracts.js';
import type { GuidancePublisher } from './pipeline.js';

export const GUIDANCE_DATA_TOPIC = 'vision-codef.guidance';

export type LiveKitTransportOptions = {
  frameIntervalMs?: number;
  onError?: (error: unknown) => void;
};

export class LiveKitGuidanceTransport implements GuidancePublisher {
  private readonly room = new Room();
  private readonly streams = new Set<VideoStream>();
  private onFrame: ((frame: FrameSample) => void) | undefined;

  constructor(private readonly options: LiveKitTransportOptions = {}) {}

  async start(
    connection: GuidanceConnection,
    onFrame: (frame: FrameSample) => void,
  ): Promise<void> {
    this.onFrame = onFrame;
    this.room.on(
      RoomEvent.TrackSubscribed,
      (track, publication, participant) =>
        this.handleTrack(track, publication, participant),
    );
    await this.room.connect(connection.serverUrl, connection.token, {
      autoSubscribe: true,
      dynacast: true,
    });
  }

  async publish(message: GuidanceMessage): Promise<void> {
    const participant = this.room.localParticipant;
    if (!participant) throw new Error('The guidance participant is not connected.');
    await participant.publishData(new TextEncoder().encode(JSON.stringify(message)), {
      reliable: true,
      topic: GUIDANCE_DATA_TOPIC,
    });
  }

  async stop(): Promise<void> {
    for (const stream of this.streams) await stream.cancel();
    this.streams.clear();
    await this.room.disconnect();
  }

  private handleTrack(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void {
    if (
      !(track instanceof RemoteVideoTrack) ||
      participant.attributes.role !== 'publisher' ||
      publication.source !== TrackSource.SOURCE_CAMERA
    ) {
      return;
    }
    const stream = new VideoStream(track);
    this.streams.add(stream);
    void this.consume(stream, participant.identity).finally(() => this.streams.delete(stream));
  }

  private async consume(stream: VideoStream, participantIdentity: string): Promise<void> {
    let lastFrameAt = 0;
    const interval = this.options.frameIntervalMs ?? 500;
    const reader = stream.getReader();
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const event = result.value;
        const now = Date.now();
        if (now - lastFrameAt < interval) continue;
        lastFrameAt = now;
        const rgba = event.frame.convert(VideoBufferType.RGBA);
        this.onFrame?.({
          data: new Uint8Array(rgba.data),
          width: rgba.width,
          height: rgba.height,
          pixelFormat: 'rgba',
          timestampMs: Number(event.timestampUs / 1000n),
          participantIdentity,
        });
      }
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      reader.releaseLock();
    }
  }
}
