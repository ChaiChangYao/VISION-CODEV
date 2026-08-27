import { AudioSession } from '@livekit/react-native';

import type { CaptureSnapshot } from '../types';

export type AudioRoute = CaptureSnapshot['audioRoute'];

export type AudioRouteManager = {
  start(): Promise<void>;
  stop(): Promise<void>;
  current(): AudioRoute;
  setRouteHint(route: Exclude<AudioRoute, 'unknown'>): void;
};

/**
 * LiveKit owns the native AVAudioSession/Android communication audio session.
 * This wrapper keeps route state explicit for the capture UI and gives the
 * native layer one idempotent lifecycle entry point.
 */
export class LiveKitAudioRouteManager implements AudioRouteManager {
  private route: AudioRoute = 'unknown';

  async start(): Promise<void> {
    await AudioSession.startAudioSession();
  }

  async stop(): Promise<void> {
    await AudioSession.stopAudioSession();
    this.route = 'unknown';
  }

  current(): AudioRoute {
    return this.route;
  }

  setRouteHint(route: Exclude<AudioRoute, 'unknown'>): void {
    this.route = route;
  }
}
