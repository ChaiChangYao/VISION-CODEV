import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';

import type { CaptureSnapshot } from '../types';

export type AudioRoute = CaptureSnapshot['audioRoute'];
export type AudioRouteListener = (route: AudioRoute) => void;

export type AudioRouteManager = {
  start(): Promise<void>;
  stop(): Promise<void>;
  current(): AudioRoute;
  setRouteHint(route: Exclude<AudioRoute, 'unknown'>): void;
  subscribe(listener: AudioRouteListener): () => void;
};

/**
 * LiveKit owns the native AVAudioSession/Android communication audio session.
 * This wrapper keeps route state explicit for the capture UI and gives the
 * native layer one idempotent lifecycle entry point.
 */
export class LiveKitAudioRouteManager implements AudioRouteManager {
  private route: AudioRoute = 'unknown';
  private routePoll: ReturnType<typeof setInterval> | undefined;
  private readonly listeners = new Set<AudioRouteListener>();

  async start(): Promise<void> {
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: ['bluetooth', 'headset', 'speaker', 'earpiece'],
        audioTypeOptions: AndroidAudioTypePresets.communication,
      },
      ios: { defaultOutput: 'speaker' },
    });
    await AudioSession.startAudioSession();
    await this.refreshRoute();
    this.routePoll = setInterval(() => { void this.refreshRoute(); }, 1000);
  }

  async stop(): Promise<void> {
    if (this.routePoll) clearInterval(this.routePoll);
    this.routePoll = undefined;
    await AudioSession.stopAudioSession();
    this.route = 'unknown';
  }

  current(): AudioRoute {
    return this.route;
  }

  setRouteHint(route: Exclude<AudioRoute, 'unknown'>): void {
    this.update(route);
  }

  subscribe(listener: AudioRouteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async refreshRoute(): Promise<void> {
    try {
      const outputs = await AudioSession.getAudioOutputs();
      const route: AudioRoute = outputs.includes('bluetooth')
        ? 'bluetooth'
        : outputs.includes('headset')
          ? 'wired'
          : outputs.some((output) => ['speaker', 'earpiece', 'default', 'force_speaker'].includes(output))
            ? 'phone'
            : 'unavailable';
      this.update(route);
    } catch {
      this.update('unavailable');
    }
  }

  private update(route: AudioRoute): void {
    if (this.route === route) return;
    this.route = route;
    for (const listener of this.listeners) listener(route);
  }
}
